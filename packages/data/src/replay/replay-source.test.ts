import {
  createMatchClock,
  runningScore,
  type Match,
  type MatchEvent,
  type MatchSource,
  type MatchUpdate,
} from '@hlc/core';
import { describe, expect, it } from 'vitest';
import realXml from '../../../../fixtures/real/live-viewall-livetexts.xml?raw';
import { parseLive } from '../chpp/live';
import { createReplaySource } from './replay-source';

const [canada, cacio] = parseLive(realXml).matches as [Match, Match];
const START = Date.UTC(2026, 10, 6, 12, 0, 0);

/** Polls the way the live app does: at each nextPollAt until finished. Returns every update. */
async function drive(source: MatchSource): Promise<{ at: number; update: MatchUpdate }[]> {
  const log: { at: number; update: MatchUpdate }[] = [];
  let now = START;
  for (let guard = 0; guard < 10_000; guard++) {
    const update = await source.poll(now);
    log.push({ at: now, update });
    if (update.finished) return log;
    if (update.nextPollAt === undefined) throw new Error('no next poll before finish');
    now = Math.max(now + 1, update.nextPollAt);
  }
  throw new Error('replay did not finish');
}

function released(log: { update: MatchUpdate }[]): MatchEvent[] {
  return log.flatMap((l) => l.update.events);
}

describe('replay simulator', () => {
  it('opens with teams and lineups only', async () => {
    const header = await createReplaySource(cacio, { startAt: START }).open();
    expect(header.home.name).toBe('FC Cacio Pepe');
    expect(header.away.lineup).toHaveLength(11);
    expect(header).not.toHaveProperty('events');
    expect(header).not.toHaveProperty('spoilers');
  });

  it('replays a saved match end to end with correct minutes and score', async () => {
    const log = await drive(createReplaySource(cacio, { startAt: START, speed: 10 }));
    const events = released(log);
    expect(events.map((e) => e.index)).toEqual(cacio.events.map((e) => e.index));
    expect(runningScore(events)).toEqual({ home: 1, away: 4 });
    expect(log.at(-1)?.update.finished).toBe(true);
    expect(log.flatMap((l) => l.update.substitutions)).toHaveLength(1);
  });

  it('releases each event when the match clock reaches its minute', async () => {
    const speed = 10;
    const log = await drive(createReplaySource(cacio, { startAt: START, speed }));
    // An independent clock with the same layout must read the event's own minute at release.
    const clock = createMatchClock({
      kickoffAt: START + 3 * (60_000 / speed),
      msPerMinute: 60_000 / speed,
    });
    clock.setAddedTime(2, 2);
    for (const { at, update } of log) {
      for (const e of update.events.filter((ev) => ev.part === 1 || ev.part === 2)) {
        expect(clock.at(at).minute).toBe(e.minute);
      }
    }
  });

  it('never releases an event before its time', async () => {
    const source = createReplaySource(cacio, { startAt: START, speed: 1 });
    const first = await source.poll(START);
    expect(first.events.map((e) => e.minute)).toEqual([-3]);
    // At 1x the first-half goal at minute 24 needs 3 + 23 minutes of wall time.
    const before = await source.poll(START + (3 + 23) * 60_000 - 1);
    expect(before.events.some((e) => e.key === '171_2')).toBe(false);
    const after = await source.poll(START + (3 + 23) * 60_000);
    expect(after.events.map((e) => e.key)).toContain('171_2');
  });

  it('runs ten times faster at 10x with the same sequence', async () => {
    const slow = await drive(createReplaySource(cacio, { startAt: START, speed: 1 }));
    const fast = await drive(createReplaySource(cacio, { startAt: START, speed: 10 }));
    expect(released(fast).map((e) => e.key)).toEqual(released(slow).map((e) => e.key));
    const slowEnd = (slow.at(-1)?.at ?? 0) - START;
    const fastEnd = (fast.at(-1)?.at ?? 0) - START;
    expect(fastEnd).toBeCloseTo(slowEnd / 10, -1);
    // Full match with a 15-minute break and 2 added minutes: 3 + 92 + 15 minutes.
    expect(slowEnd).toBe((3 + 91 + 15) * 60_000);
  });

  it('is deterministic', async () => {
    const a = await drive(createReplaySource(canada, { startAt: START, speed: 10 }));
    const b = await drive(createReplaySource(canada, { startAt: START, speed: 10 }));
    expect(b).toEqual(a);
  });

  it('handles extra time and a shoot-out in order', async () => {
    const log = await drive(createReplaySource(canada, { startAt: START, speed: 10 }));
    const events = released(log);
    expect(events).toHaveLength(35);
    const parts = events.map((e) => e.part);
    expect([...parts].sort((x, y) => x - y)).toEqual(parts);
    expect(events.at(-1)?.key).toBe('599_3');
  });

  it('only hints the next poll time and never repeats events', async () => {
    const source = createReplaySource(cacio, { startAt: START, speed: 10 });
    const first = await source.poll(START);
    expect(first.nextPollAt).toBeGreaterThan(START);
    const again = await source.poll(START);
    expect(again.events).toEqual([]);
  });

  it('returns nothing after close', async () => {
    const source = createReplaySource(cacio, { startAt: START });
    source.close();
    expect(await source.poll(START + 10 * 3_600_000)).toEqual({
      events: [],
      substitutions: [],
      finished: true,
    });
  });

  it('does not let callers mutate the fixture', async () => {
    const source = createReplaySource(cacio, { startAt: START, speed: 10 });
    const { events } = await source.poll(START);
    if (events[0]) events[0].minute = 999;
    expect(cacio.events[0]?.minute).toBe(-3);
  });
});
