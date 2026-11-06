import {
  createMatchClock,
  type Match,
  type MatchEvent,
  type MatchHeader,
  type MatchPart,
  type MatchSource,
  type MatchUpdate,
  type Substitution,
} from '@hlc/core';

/**
 * Replays a saved match as if it were live. Implements the same `MatchSource` as live CHPP, so
 * nothing downstream special-cases replays. Fully deterministic: time only comes in through
 * `poll(nowMs)`.
 */

export interface ReplayOptions {
  /** Epoch ms at which the replay starts (pre-match events begin here). */
  startAt: number;
  /** 1 = real time, 10 = ten times faster. */
  speed?: number;
  /** Minutes of play between the replay start and kick-off; covers pre-match events (-3..-1). */
  preMatchMinutes?: number;
  halfTimeBreakMinutes?: number;
  extraTimeBreakMinutes?: number;
}

interface Timed<T> {
  at: number;
  item: T;
}

export function createReplaySource(match: Match, options: ReplayOptions): MatchSource {
  const speed = options.speed ?? 1;
  if (!(speed > 0)) throw new RangeError('speed must be positive');
  const msPerMinute = 60_000 / speed;
  const preMatchMinutes = options.preMatchMinutes ?? Math.max(3, -minMinute(match.events));
  const kickoffAt = options.startAt + preMatchMinutes * msPerMinute;

  // The replay knows the whole match, so it can lay out a CHPP-like timeline in advance. This
  // only shapes timing; nothing here is exposed except events at their time.
  const clock = createMatchClock({
    kickoffAt,
    msPerMinute,
    ...(options.halfTimeBreakMinutes !== undefined
      ? { halfTimeBreakMinutes: options.halfTimeBreakMinutes }
      : {}),
    ...(options.extraTimeBreakMinutes !== undefined
      ? { extraTimeBreakMinutes: options.extraTimeBreakMinutes }
      : {}),
  });
  for (const part of [1, 2, 3] as const) {
    const regularEnd = part === 1 ? 45 : part === 2 ? 90 : 120;
    const last = maxMinute(match.events, part);
    if (last > regularEnd) clock.setAddedTime(part, last - regularEnd);
  }
  if (match.events.some((e) => e.part >= 3)) clock.expectExtraTime();
  if (match.events.some((e) => e.part === 4)) clock.observe(121, 4, clock.wallTime(121, 4));

  const ordered = [...match.events].sort((a, b) => a.index - b.index);
  const events: Timed<MatchEvent>[] = [];
  let previous = options.startAt;
  for (const e of ordered) {
    const at = Math.max(previous, eventTime(e, clock.wallTime, options.startAt));
    events.push({ at, item: e });
    previous = at;
  }
  const substitutions: Timed<Substitution>[] = match.substitutions
    .map((s) => ({ at: clock.wallTime(s.minute, partOfMinute(s.minute)), item: s }))
    .sort((a, b) => a.at - b.at);

  const header: MatchHeader = {
    matchId: match.matchId,
    sourceSystem: match.sourceSystem,
    matchType: match.matchType,
    matchDate: match.matchDate,
    home: match.home,
    away: match.away,
  };
  const endAt = events[events.length - 1]?.at ?? options.startAt;

  let nextEvent = 0;
  let nextSub = 0;
  let closed = false;

  return {
    open() {
      return Promise.resolve(structuredClone(header));
    },
    poll(nowMs) {
      if (closed) return Promise.resolve({ events: [], substitutions: [], finished: true });
      const update: MatchUpdate = { events: [], substitutions: [], finished: false };
      for (let e = events[nextEvent]; e && e.at <= nowMs; e = events[++nextEvent]) {
        update.events.push(structuredClone(e.item));
      }
      for (let s = substitutions[nextSub]; s && s.at <= nowMs; s = substitutions[++nextSub]) {
        update.substitutions.push(structuredClone(s.item));
      }
      const pending = events[nextEvent]?.at;
      if (pending !== undefined) {
        update.nextPollAt = pending;
      } else {
        update.finished = nowMs >= endAt && nextSub >= substitutions.length;
        const sub = substitutions[nextSub]?.at;
        if (sub !== undefined) update.nextPollAt = sub;
      }
      return Promise.resolve(update);
    },
    close() {
      closed = true;
    },
  };
}

function eventTime(
  e: MatchEvent,
  wallTime: (minute: number, part: MatchPart) => number,
  startAt: number,
): number {
  if (e.part === 0) return Math.max(startAt, wallTime(e.minute, 0));
  // Events at a part's boundary minute (e.g. 120 in part 4, 90 in part 2 before extra time) are
  // placed at the start of their minute.
  return wallTime(e.minute, e.part);
}

function partOfMinute(minute: number): MatchPart {
  if (minute <= 45) return 1;
  if (minute <= 90) return 2;
  if (minute <= 120) return 3;
  return 4;
}

function minMinute(events: readonly MatchEvent[]): number {
  return events.reduce((min, e) => Math.min(min, e.minute), 0);
}

function maxMinute(events: readonly MatchEvent[], part: MatchPart): number {
  return events.filter((e) => e.part === part).reduce((max, e) => Math.max(max, e.minute), 0);
}
