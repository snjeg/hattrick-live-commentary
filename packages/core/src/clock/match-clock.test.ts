import { describe, expect, it } from 'vitest';
import { addedMinutesFromText, createMatchClock } from './match-clock';

const MIN = 1000; // 1 minute of play = 1 s of wall time keeps the arithmetic readable
const KICKOFF = 100_000;

function clock(extra: Partial<Parameters<typeof createMatchClock>[0]> = {}) {
  return createMatchClock({ kickoffAt: KICKOFF, msPerMinute: MIN, ...extra });
}

describe('match clock: regular time', () => {
  it('counts down pre-match with negative minutes', () => {
    const c = clock();
    expect(c.at(KICKOFF - 2500)).toEqual({ phase: 'preMatch', part: 0, minute: -3 });
    expect(c.at(KICKOFF - 1)).toEqual({ phase: 'preMatch', part: 0, minute: -1 });
    expect(c.wallTime(-2, 0)).toBe(KICKOFF - 2 * MIN);
  });

  it('uses Hattrick numbering: first half 1-45, second half 46-90', () => {
    const c = clock();
    expect(c.at(KICKOFF)).toEqual({ phase: 'firstHalf', part: 1, minute: 1 });
    expect(c.at(KICKOFF + 44 * MIN + 999)).toEqual({ phase: 'firstHalf', part: 1, minute: 45 });
    expect(c.wallTime(46, 2)).toBe(KICKOFF + 45 * MIN + 15 * MIN);
    expect(c.at(c.wallTime(46, 2))).toEqual({ phase: 'secondHalf', part: 2, minute: 46 });
    expect(c.at(c.wallTime(90, 2) + 999)).toEqual({ phase: 'secondHalf', part: 2, minute: 90 });
  });

  it('has a half-time break and ends after 90 minutes', () => {
    const c = clock();
    expect(c.at(KICKOFF + 45 * MIN)).toEqual({ phase: 'halfTime', part: 1, minute: 45 });
    expect(c.at(KICKOFF + 59 * MIN)).toEqual({ phase: 'halfTime', part: 1, minute: 45 });
    expect(c.at(c.wallTime(90, 2) + MIN)).toEqual({ phase: 'finished', part: 2, minute: 90 });
  });

  it('round-trips wallTime and at for every minute', () => {
    const c = clock();
    for (let m = 1; m <= 45; m++) expect(c.at(c.wallTime(m, 1)).minute).toBe(m);
    for (let m = 46; m <= 90; m++) expect(c.at(c.wallTime(m, 2)).minute).toBe(m);
  });

  it('scales with replay speed', () => {
    const c = createMatchClock({ kickoffAt: 0, msPerMinute: 6000 });
    expect(c.wallTime(46, 2)).toBe(60 * 6000);
  });
});

describe('match clock: added time', () => {
  it('extends a half and shifts what follows when added time is announced', () => {
    const c = clock();
    c.setAddedTime(1, 2);
    expect(c.at(KICKOFF + 46 * MIN)).toEqual({ phase: 'firstHalf', part: 1, minute: 47 });
    expect(c.at(KICKOFF + 47 * MIN)).toEqual({ phase: 'halfTime', part: 1, minute: 47 });
    expect(c.wallTime(46, 2)).toBe(KICKOFF + 47 * MIN + 15 * MIN);
  });

  it('stretches a half when events arrive in stoppage time', () => {
    const c = clock();
    c.observe(92, 2, c.wallTime(92, 2));
    expect(c.at(c.wallTime(92, 2))).toEqual({ phase: 'secondHalf', part: 2, minute: 92 });
    expect(c.at(c.wallTime(92, 2) + MIN)).toEqual({ phase: 'finished', part: 2, minute: 92 });
  });

  it('never shrinks added time', () => {
    const c = clock();
    c.setAddedTime(2, 3);
    c.setAddedTime(2, 1);
    expect(c.at(c.wallTime(93, 2)).minute).toBe(93);
  });

  it('reads added minutes from the event 75 text', () => {
    expect(
      addedMinutesFromText(
        'The referee will let play continue for an additional 2 minutes beyond the allotted 90.',
      ),
    ).toBe(2);
    expect(addedMinutesFromText('No added time.')).toBeUndefined();
  });
});

describe('match clock: drift correction', () => {
  it('ignores events that land inside their expected minute', () => {
    const c = clock();
    const before = c.wallTime(30, 1);
    c.observe(30, 1, before + 500);
    expect(c.wallTime(30, 1)).toBe(before);
  });

  it('moves toward late events, capped per observation', () => {
    const c = clock({ correctionGain: 0.5, maxCorrectionMinutes: 2 });
    const expected = c.wallTime(30, 1);
    c.observe(30, 1, expected + 5 * MIN); // 4 min late after the minute window -> capped at 2
    expect(c.wallTime(30, 1)).toBe(expected + 2 * MIN);
    c.observe(30, 1, expected + 5 * MIN);
    expect(c.wallTime(30, 1)).toBeGreaterThan(expected + 2 * MIN);
  });

  it('moves toward early events', () => {
    const c = clock({ correctionGain: 1 });
    const expected = c.wallTime(20, 1);
    c.observe(20, 1, expected - 1000);
    expect(c.wallTime(20, 1)).toBe(expected - 1000);
  });

  it('anchors a new part exactly on its first event', () => {
    const c = clock();
    const actual = c.wallTime(46, 2) + 3 * MIN; // second half started 3 minutes late
    c.observe(46, 2, actual);
    expect(c.wallTime(46, 2)).toBe(actual);
    expect(c.at(actual)).toEqual({ phase: 'secondHalf', part: 2, minute: 46 });
  });
});

describe('match clock: extra time and shoot-out', () => {
  it('has an extra-time break, then minutes 91-120', () => {
    const c = clock();
    c.expectExtraTime();
    const end2 = c.wallTime(90, 2) + MIN;
    expect(c.at(end2)).toEqual({ phase: 'extraTimeBreak', part: 2, minute: 90 });
    expect(c.at(end2 + 5 * MIN)).toEqual({ phase: 'extraTime', part: 3, minute: 91 });
    expect(c.at(end2 + 35 * MIN)).toEqual({ phase: 'finished', part: 3, minute: 120 });
  });

  it('switches to the shoot-out when part 4 events arrive', () => {
    const c = clock();
    c.observe(96, 3, c.wallTime(96, 3));
    c.observe(120, 4, c.wallTime(120, 4));
    expect(c.at(c.wallTime(121, 4))).toEqual({ phase: 'shootout', part: 4, minute: 121 });
    expect(c.at(c.wallTime(125, 4)).minute).toBe(125);
  });

  it('reports finished after the final whistle', () => {
    const c = clock();
    const t = c.wallTime(92, 2);
    c.observe(92, 2, t);
    c.finish(t + 100);
    expect(c.at(t + 100)).toEqual({ phase: 'finished', part: 2, minute: 92 });
    expect(c.at(t + 60 * MIN).phase).toBe('finished');
  });
});
