import type { MatchPart } from '../model/types';

/**
 * Maps minutes of play to wall-clock time and back.
 *
 * Timeline (Hattrick numbering): pre-match (part 0, minutes -3..0) -> first half, minutes 1-45 ->
 * half-time break -> second half, minutes 46-90 -> optional extra-time break -> extra time,
 * minutes 91-120 -> shoot-out, minutes 121+. Added time extends a half; events seen in a part re-anchor it
 * (drift correction), and later parts are predicted from the latest anchor.
 */

export type ClockPhase =
  | 'preMatch'
  | 'firstHalf'
  | 'halfTime'
  | 'secondHalf'
  | 'extraTimeBreak'
  | 'extraTime'
  | 'shootout'
  | 'finished';

export interface ClockReading {
  phase: ClockPhase;
  /** The part being played, or the one that just ended during a break. */
  part: MatchPart;
  /** Minute of play (integer). Negative before kick-off; keeps counting in stoppage time. */
  minute: number;
}

export interface MatchClockOptions {
  /** Epoch ms of the first-half kick-off (minute 0). */
  kickoffAt: number;
  /** Wall ms per minute of play: 60000 live, 6000 for a 10x replay. */
  msPerMinute?: number;
  /** Break lengths in minutes of play (scaled by msPerMinute). */
  halfTimeBreakMinutes?: number;
  extraTimeBreakMinutes?: number;
  shootoutBreakMinutes?: number;
  /** Fraction of an observed error applied per observation (0..1). */
  correctionGain?: number;
  /** Largest single correction, in minutes of play. */
  maxCorrectionMinutes?: number;
}

const PART_START_MINUTE: Record<Exclude<MatchPart, 0>, number> = { 1: 0, 2: 45, 3: 90, 4: 120 };
const PART_LENGTH: Record<Exclude<MatchPart, 0>, number> = { 1: 45, 2: 45, 3: 30, 4: 0 };
type PlayPart = Exclude<MatchPart, 0>;

export interface MatchClock {
  at(nowMs: number): ClockReading;
  /** Wall time (epoch ms) at which the given minute of the given part starts. */
  wallTime(minute: number, part: MatchPart): number;
  /** Added (stoppage) minutes announced for a half, e.g. from event 75. */
  setAddedTime(part: 1 | 2 | 3, minutes: number): void;
  /** Extra time will be played (event 70), so the second half is followed by a break. */
  expectExtraTime(): void;
  /** Feed every event as it arrives; corrects drift between the model and reality. */
  observe(minute: number, part: MatchPart, atMs: number): void;
  /** Full-time whistle seen. */
  finish(atMs: number): void;
}

export function createMatchClock(options: MatchClockOptions): MatchClock {
  const ms = options.msPerMinute ?? 60_000;
  const breaks: Record<PlayPart, number> = {
    1: 0,
    2: options.halfTimeBreakMinutes ?? 15,
    3: options.extraTimeBreakMinutes ?? 5,
    4: options.shootoutBreakMinutes ?? 0,
  };
  const gain = options.correctionGain ?? 0.5;
  const maxCorrection = (options.maxCorrectionMinutes ?? 2) * ms;

  const added: Record<PlayPart, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  /** Observed or corrected start times per part; others are predicted from the previous part. */
  const anchors: Partial<Record<PlayPart, number>> = { 1: options.kickoffAt };
  let extraTime = false;
  let shootout = false;
  let finishedAt: number | undefined;
  let lastPartSeen: MatchPart = 0;

  function partStart(part: PlayPart): number {
    const anchored = anchors[part];
    if (anchored !== undefined) return anchored;
    const prev = (part - 1) as PlayPart;
    return partStart(prev) + (PART_LENGTH[prev] + added[prev] + breaks[part]) * ms;
  }

  function partEnd(part: PlayPart): number {
    return partStart(part) + (PART_LENGTH[part] + added[part]) * ms;
  }

  function minuteIn(part: PlayPart, nowMs: number): number {
    // Hattrick counts the first minute of a part as start + 1 (first half 1-45, second half 46-90).
    return PART_START_MINUTE[part] + Math.floor((nowMs - partStart(part)) / ms) + 1;
  }

  function wallTime(minute: number, part: MatchPart): number {
    if (part === 0) return options.kickoffAt + minute * ms;
    return partStart(part) + (minute - PART_START_MINUTE[part] - 1) * ms;
  }

  function at(nowMs: number): ClockReading {
    if (finishedAt !== undefined && nowMs >= finishedAt) return finalReading(finishedAt);
    if (nowMs < options.kickoffAt) {
      return { phase: 'preMatch', part: 0, minute: Math.floor((nowMs - options.kickoffAt) / ms) };
    }
    const enabled: PlayPart[] = shootout ? [1, 2, 3, 4] : extraTime ? [1, 2, 3] : [1, 2];
    let part: PlayPart = 1;
    for (const p of enabled) if (nowMs >= partStart(p)) part = p;

    if (part === 4 || nowMs < partEnd(part)) {
      return { phase: playPhase(part), part, minute: minuteIn(part, nowMs) };
    }
    const lastMinute = PART_START_MINUTE[part] + PART_LENGTH[part] + added[part];
    if (part === 1) return { phase: 'halfTime', part, minute: lastMinute };
    if (part === 2 && extraTime) return { phase: 'extraTimeBreak', part, minute: lastMinute };
    return { phase: 'finished', part, minute: lastMinute };
  }

  function finalReading(atMs: number): ClockReading {
    const part = (lastPartSeen === 0 ? 2 : lastPartSeen) as PlayPart;
    const minute = Math.min(
      minuteIn(part, atMs),
      part === 4
        ? Number.MAX_SAFE_INTEGER
        : PART_START_MINUTE[part] + PART_LENGTH[part] + added[part],
    );
    return { phase: 'finished', part, minute: Math.max(minute, PART_START_MINUTE[part]) };
  }

  function observe(minute: number, part: MatchPart, atMs: number): void {
    if (part === 3) extraTime = true;
    if (part === 4) {
      extraTime = true;
      shootout = true;
    }
    if (part > lastPartSeen) lastPartSeen = part;
    if (part === 0) return;
    // Minutes beyond the planned end mean stoppage time is being played: stretch the part.
    const overrun = minute - (PART_START_MINUTE[part] + PART_LENGTH[part]);
    if (part !== 4 && overrun > added[part]) added[part] = overrun;

    const expectedStart = wallTime(minute, part);
    // Anything inside the expected minute is consistent: events land somewhere within their minute.
    if (atMs >= expectedStart && atMs < expectedStart + ms) return;

    if (anchors[part] === undefined && part > 1 && minute <= PART_START_MINUTE[part] + 1) {
      // First sight of a new part at its opening minute: anchor exactly.
      anchors[part] = atMs - Math.max(0, minute - PART_START_MINUTE[part] - 1) * ms;
      return;
    }
    const error = atMs < expectedStart ? atMs - expectedStart : atMs - (expectedStart + ms - 1);
    const step = Math.max(-maxCorrection, Math.min(maxCorrection, Math.round(error * gain)));
    anchors[part] = partStart(part) + step;
  }

  return {
    at,
    wallTime,
    setAddedTime(part, minutes) {
      added[part] = Math.max(added[part], Math.floor(minutes));
    },
    expectExtraTime() {
      extraTime = true;
    },
    observe,
    finish(atMs) {
      finishedAt = atMs;
    },
  };
}

function playPhase(part: PlayPart): ClockPhase {
  switch (part) {
    case 1:
      return 'firstHalf';
    case 2:
      return 'secondHalf';
    case 3:
      return 'extraTime';
    case 4:
      return 'shootout';
  }
}

/** Reads the added minutes from an event-75 text such as "an additional 2 minutes beyond the allotted 90". */
export function addedMinutesFromText(text: string): number | undefined {
  const m = /additional\s+(\d{1,2})\s+minutes?/i.exec(text);
  return m ? Number(m[1]) : undefined;
}
