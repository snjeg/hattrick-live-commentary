import type { Line } from './line';
import { estimateDurationMs, type Scheduler } from './scheduler';

/**
 * Drives a scheduler through simulated time with a fake voice, for tests and for printing a
 * replayed match as a script. Pure and deterministic.
 */

export interface SpokenLine {
  line: Line;
  start: number;
  end: number;
  interrupted: boolean;
}

export interface SimulationResult {
  transcript: SpokenLine[];
  /** Longest stretch with nobody speaking, between `from` and `to`. */
  longestSilenceMs: number;
  longestSilenceAt: number;
  /** Times a line started while another was still playing (must be 0: one voice at a time). */
  overlaps: number;
}

export interface SimulationOptions {
  scheduler: Scheduler;
  from: number;
  to: number;
  stepMs?: number;
  /** New lines that become available at `now` (e.g. from events released by a MatchSource). */
  arrivals: (now: number) => Line[];
  duration?: (line: Line) => number;
}

export function simulate(options: SimulationOptions): SimulationResult {
  const step = options.stepMs ?? 100;
  const duration = options.duration ?? ((l: Line) => estimateDurationMs(l.text));
  const transcript: SpokenLine[] = [];
  let speaking: SpokenLine | undefined;
  let lastEnd = options.from;
  let longest = 0;
  let longestAt = options.from;
  let overlaps = 0;

  for (let now = options.from; now <= options.to; now += step) {
    const arrived = options.arrivals(now);
    if (arrived.length > 0) options.scheduler.enqueue(arrived, now);

    if (speaking && now >= speaking.end) {
      options.scheduler.finished(speaking.line.id, speaking.end);
      lastEnd = speaking.end;
      speaking = undefined;
    }

    for (let guard = 0; guard < 3; guard++) {
      const decision = options.scheduler.tick(now);
      if (decision.interrupt && speaking?.line.id === decision.interrupt) {
        speaking.end = now;
        speaking.interrupted = true;
        options.scheduler.finished(speaking.line.id, now);
        lastEnd = now;
        speaking = undefined;
        continue;
      }
      if (decision.speak) {
        if (speaking) overlaps++;
        const silence = now - lastEnd;
        if (silence > longest) {
          longest = silence;
          longestAt = lastEnd;
        }
        speaking = {
          line: decision.speak,
          start: now,
          end: now + duration(decision.speak),
          interrupted: false,
        };
        transcript.push(speaking);
      }
      break;
    }
  }
  const tail = speaking ? 0 : options.to - lastEnd;
  if (tail > longest) {
    longest = tail;
    longestAt = lastEnd;
  }
  return { transcript, longestSilenceMs: longest, longestSilenceAt: longestAt, overlaps };
}

/** Formats a transcript as a readable script: `[mm:ss] LEAD (excited): text`. */
export function formatScript(transcript: readonly SpokenLine[], origin: number): string {
  return transcript
    .map((s) => {
      const t = Math.max(0, Math.round((s.start - origin) / 1000));
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(t % 60).padStart(2, '0');
      const cut = s.interrupted ? ' [cut]' : '';
      return `[${mm}:${ss}] ${s.line.speaker.toUpperCase()} (${s.line.mood}): ${s.line.text}${cut}`;
    })
    .join('\n');
}
