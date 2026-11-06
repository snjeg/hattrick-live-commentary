import type { Speaker } from '../model/voice';
import type { Line } from './line';

/**
 * One floor, two voices. Only one line plays at a time; the lead has priority; analyst lines
 * yield (are interrupted) when a more important line arrives; stale lines are dropped; gaps are
 * filled before silence reaches the configured limit (rule 5). Pure: time comes in as arguments,
 * and the caller reports when a line has finished.
 */

export interface SchedulerOptions {
  /** Silence longer than this is a bug. The crowd bed keeps playing underneath. */
  silenceLimitMs?: number;
  /** Ask for a filler once the floor has been free this long (must be below the limit). */
  fillAfterMs?: number;
  /** Breath between lines. */
  pauseMs?: number;
  /** Every line is spoken by the lead voice. */
  oneCommentator?: boolean;
  /**
   * Supplies a gap filler. With `mustSpeak` false it may return undefined when it has nothing
   * fresh; the scheduler then waits and asks again with `mustSpeak` true just before the limit.
   */
  filler: (now: number, mustSpeak: boolean) => Line | undefined;
}

export interface Decision {
  /** Start speaking this line now (with `speaker` already adjusted for one-commentator mode). */
  speak?: Line;
  /** Cut off the line with this id before anything else. */
  interrupt?: string;
}

export interface Scheduler {
  enqueue(lines: readonly Line[], now: number): void;
  /** Decide what happens on the floor now. Call often (e.g. every 100-250 ms) and after `finished`. */
  tick(now: number): Decision;
  /** The voice finished, was interrupted or failed. */
  finished(lineId: string, now: number): void;
  readonly speaking: Line | undefined;
  readonly queued: readonly Line[];
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const silenceLimit = options.silenceLimitMs ?? 20_000;
  const fillAfter = Math.min(options.fillAfterMs ?? 14_000, silenceLimit - 500);
  const pause = options.pauseMs ?? 350;
  /** Last moment to start a filler and stay within the limit, allowing for one tick of latency. */
  const mustFillAt = silenceLimit - 1_000;
  let lastFreshAsk: number | undefined;
  let queue: { line: Line; seq: number }[] = [];
  let seq = 0;
  let current: Line | undefined;
  let interrupting: string | undefined;
  let freeSince: number | undefined;
  let spokeBefore = false;

  const voice = (speaker: Speaker): Speaker => (options.oneCommentator ? 'lead' : speaker);

  function order(): void {
    // Higher priority first; within a priority, arrival order (keeps an event's beats in sequence).
    queue.sort((a, b) => b.line.priority - a.line.priority || a.seq - b.seq);
  }

  function dropExpired(now: number): void {
    queue = queue.filter((q) => q.line.expiresAt > now);
  }

  return {
    get speaking() {
      return current;
    },
    get queued() {
      return queue.map((q) => q.line);
    },

    enqueue(lines, now) {
      for (const line of lines) if (line.expiresAt > now) queue.push({ line, seq: seq++ });
      order();
    },

    tick(now) {
      dropExpired(now);
      if (freeSince === undefined && !current) freeSince = now;

      if (current) {
        const top = queue[0]?.line;
        const outranks = top && top.priority > current.priority;
        // The lead has the floor: an analyst line always yields to a more important line, and an
        // interruptible lead line yields to a more important lead line.
        if (
          outranks &&
          current.interruptible &&
          interrupting !== current.id &&
          (current.speaker === 'analyst' || top.speaker === 'lead')
        ) {
          interrupting = current.id;
          return { interrupt: current.id };
        }
        return {};
      }

      const free = now - (freeSince ?? now);
      if (spokeBefore && free < pause) return {};

      const next = queue.shift()?.line;
      if (next) return start(next);
      if (free >= mustFillAt) {
        const line = options.filler(now, true);
        if (line) return start(line);
      } else if (free >= fillAfter && lastFreshAsk !== freeSince) {
        lastFreshAsk = freeSince;
        const line = options.filler(now, false);
        if (line) return start(line);
      }
      return {};

      function start(line: Line): Decision {
        current = line;
        freeSince = undefined;
        spokeBefore = true;
        return { speak: { ...line, speaker: voice(line.speaker) } };
      }
    },

    finished(lineId, now) {
      if (current?.id !== lineId) return;
      current = undefined;
      interrupting = undefined;
      freeSince = now;
    },
  };
}

/** Rough speaking time for planning and simulation: about 2.6 words per second plus a lead-in. */
export function estimateDurationMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((300 + (words / 2.6) * 1000) / Math.max(0.5, rate));
}
