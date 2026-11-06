import { describe, expect, it } from 'vitest';
import { createMatchClock } from '../clock/match-clock';
import { classifyEventType } from '../model/event-types';
import { runningScore } from '../model/score';
import type { MatchEvent, Side, Team } from '../model/types';
import type { Line } from './line';
import { seededRandom } from './rng';
import { createScheduler, estimateDurationMs } from './scheduler';
import { formatScript, simulate } from './simulate';
import { createTalkingPoints, factsFromEvent } from './talking-points';
import { createTemplateWriter } from './template-writer';

let n = 0;
function line(over: Partial<Line> = {}): Line {
  return {
    id: `l${n++}`,
    speaker: 'lead',
    text: 'Something happens.',
    mood: 'neutral',
    intensity: 0.5,
    priority: 50,
    interruptible: true,
    expiresAt: 1e12,
    ...over,
  };
}

const filler = (now: number) =>
  line({ id: `fill${now}`, speaker: 'analyst', priority: 10, text: 'Filler.' });

describe('scheduler: one floor', () => {
  it('plays one line at a time with a pause between', () => {
    const s = createScheduler({ filler, pauseMs: 300 });
    const a = line();
    const b = line();
    s.enqueue([a, b], 0);
    expect(s.tick(300).speak?.id).toBe(a.id);
    expect(s.tick(400)).toEqual({});
    s.finished(a.id, 1000);
    expect(s.tick(1100)).toEqual({});
    expect(s.tick(1300).speak?.id).toBe(b.id);
  });

  it('gives the lead priority and keeps beats of one event in order', () => {
    const s = createScheduler({ filler, pauseMs: 0 });
    const analyst = line({ speaker: 'analyst', priority: 50 });
    const beats = [line({ priority: 80 }), line({ priority: 80 }), line({ priority: 80 })];
    s.enqueue([analyst, ...beats], 0);
    const order: string[] = [];
    for (let t = 0; t < 4; t++) {
      const d = s.tick(t * 10);
      if (d.speak) {
        order.push(d.speak.id);
        s.finished(d.speak.id, t * 10 + 5);
      }
    }
    expect(order).toEqual([...beats.map((b) => b.id), analyst.id]);
  });

  it('makes the analyst yield to a more important line', () => {
    const s = createScheduler({ filler, pauseMs: 0 });
    const talk = line({ speaker: 'analyst', priority: 10 });
    s.enqueue([talk], 0);
    expect(s.tick(0).speak?.id).toBe(talk.id);
    const goal = line({ priority: 100, interruptible: false });
    s.enqueue([goal], 50);
    expect(s.tick(50)).toEqual({ interrupt: talk.id });
    expect(s.tick(60)).toEqual({}); // waiting for the voice to stop
    s.finished(talk.id, 70);
    expect(s.tick(70).speak?.id).toBe(goal.id);
  });

  it('never cuts an uninterruptible line, and the analyst never cuts the lead', () => {
    const s = createScheduler({ filler, pauseMs: 0 });
    const goal = line({ priority: 100, interruptible: false });
    s.enqueue([goal], 0);
    s.tick(0);
    s.enqueue([line({ priority: 200 })], 10);
    expect(s.tick(10)).toEqual({});

    const s2 = createScheduler({ filler, pauseMs: 0 });
    const call = line({ priority: 80 });
    s2.enqueue([call], 0);
    s2.tick(0);
    s2.enqueue([line({ speaker: 'analyst', priority: 90 })], 10);
    expect(s2.tick(10)).toEqual({});
  });

  it('drops lines that expired while waiting', () => {
    const s = createScheduler({ filler, pauseMs: 0, fillAfterMs: 1e9, silenceLimitMs: 2e9 });
    const first = line();
    s.enqueue([first, line({ expiresAt: 500 })], 0);
    s.tick(0);
    s.finished(first.id, 600);
    expect(s.tick(600)).toEqual({});
    expect(s.queued).toEqual([]);
  });

  it('fills a gap before the silence limit', () => {
    const s = createScheduler({ filler, pauseMs: 0, fillAfterMs: 2000, silenceLimitMs: 5000 });
    expect(s.tick(0)).toEqual({});
    expect(s.tick(1999)).toEqual({});
    expect(s.tick(2000).speak?.text).toBe('Filler.');
  });

  it('waits for fresh material, but speaks before the silence limit regardless', () => {
    const asked: boolean[] = [];
    const s = createScheduler({
      pauseMs: 0,
      fillAfterMs: 2000,
      silenceLimitMs: 6000,
      filler: (now, mustSpeak) => {
        asked.push(mustSpeak);
        return mustSpeak ? filler(now) : undefined;
      },
    });
    expect(s.tick(0)).toEqual({});
    expect(s.tick(2000)).toEqual({});
    expect(s.tick(3000)).toEqual({}); // asked once per gap
    expect(s.tick(4999)).toEqual({});
    expect(s.tick(5000).speak?.text).toBe('Filler.');
    expect(asked).toEqual([false, true]);
  });

  it('speaks everything with the lead voice in one-commentator mode', () => {
    const s = createScheduler({ filler, pauseMs: 0, oneCommentator: true });
    s.enqueue([line({ speaker: 'analyst' })], 0);
    expect(s.tick(0).speak?.speaker).toBe('lead');
  });

  it('estimates speaking time from word count', () => {
    expect(
      estimateDurationMs('one two three four five six seven eight nine ten eleven twelve thirteen'),
    ).toBe(5300);
    expect(estimateDurationMs('word', 2)).toBeLessThan(estimateDurationMs('word'));
  });
});

// A synthetic 90-minute match: two goals, chances, a card, an injury and context events.
const home: Team = {
  id: 1,
  name: 'Canada',
  shortName: 'Canada',
  lineup: [{ id: 11, name: 'Neil Pemberton', roleId: 111 }],
};
const away: Team = {
  id: 2,
  name: 'Nederland',
  shortName: 'Nederland',
  lineup: [{ id: 21, name: 'Roel Dorenbos', roleId: 107 }],
};

function ev(
  index: number,
  minute: number,
  part: 0 | 1 | 2,
  typeId: number,
  beats: string[],
  side?: Side,
): MatchEvent {
  return {
    index,
    minute,
    part,
    key: `${typeId}_1`,
    typeId,
    variant: 1,
    ...classifyEventType(typeId),
    beats: beats.map((text) => ({ text, mentions: [] })),
    ...(side ? { side } : {}),
    ...(side ? { subjectPlayerId: side === 'home' ? 11 : 21 } : {}),
  };
}

const EVENTS: MatchEvent[] = [
  ev(0, -2, 0, 32, ['It is completely packed here today!']),
  ev(1, -1, 0, 25, ["It's derby day!"]),
  ev(2, 0, 0, 598, ['The referee signals that the match can start. There is the kick off!']),
  ev(3, 5, 1, 811, ['The last time these teams met, it ended in a draw.']),
  ev(4, 23, 1, 510, ['A late challenge!', 'The referee shows the yellow card.'], 'away'),
  ev(
    5,
    36,
    1,
    121,
    ['Build-up play here...', 'Pemberton looks for an opening...', 'GOAL! 1 - 0 to Canada.'],
    'home',
  ),
  ev(6, 45, 1, 45, ['The referee blows the whistle.', "That's all for the first half."]),
  ev(7, 46, 2, 597, ["It's time for the second half!"]),
  ev(8, 51, 2, 219, ['Corner kick...', 'The header is saved!'], 'away'),
  ev(9, 62, 2, 401, ['A player is down holding his knee.'], 'away'),
  ev(
    10,
    79,
    2,
    162,
    ['Build-up play...', 'Dorenbos hits it on the volley!', 'GOAL! It is all even, 1 - 1.'],
    'away',
  ),
  ev(11, 90, 2, 599, ['This match is over.', 'The final result is 1 - 1.']),
];

describe('simulated 90-minute broadcast', () => {
  const MIN = 60_000;
  const START = 0;
  const kickoff = START + 3 * MIN;
  const clock = createMatchClock({ kickoffAt: kickoff, msPerMinute: MIN });
  const SILENCE_LIMIT = 20_000;

  function run(oneCommentator = false) {
    const writer = createTemplateWriter({ random: seededRandom(11) });
    const points = createTalkingPoints({ random: seededRandom(12) });
    const scheduler = createScheduler({
      silenceLimitMs: SILENCE_LIMIT,
      oneCommentator,
      filler: (now, mustSpeak) => {
        const situation = {
          now,
          minute: clock.at(now).minute,
          score: runningScore(released),
          home,
          away,
        };
        return mustSpeak ? points.next(situation) : points.fresh(situation);
      },
    });
    const released: MatchEvent[] = [];
    const due = EVENTS.map((e) => ({
      e,
      at: e.part === 0 ? clock.wallTime(e.minute, 0) : clock.wallTime(e.minute, e.part),
    }));
    const end = clock.wallTime(90, 2) + MIN;
    const result = simulate({
      scheduler,
      from: START,
      to: end,
      arrivals: (now) => {
        const lines: Line[] = [];
        while (due[0] && due[0].at <= now) {
          const { e } = due.shift() as { e: MatchEvent; at: number };
          released.push(e);
          points.add(factsFromEvent(e), now);
          lines.push(
            ...writer.linesForEvent({ event: e, home, away, score: runningScore(released), now }),
          );
        }
        return lines;
      },
    });
    return result;
  }

  const result = run();
  const spoken = result.transcript;

  it('never goes silent for longer than the limit', () => {
    expect(result.longestSilenceMs).toBeLessThanOrEqual(SILENCE_LIMIT);
  });

  it('keeps one voice at a time', () => {
    expect(result.overlaps).toBe(0);
    for (let i = 1; i < spoken.length; i++) {
      expect(spoken[i]?.start).toBeGreaterThanOrEqual(spoken[i - 1]?.end ?? 0);
    }
  });

  it('speaks every goal beat, in order, and never cuts the goal call', () => {
    for (const text of [
      'Build-up play here...',
      'Pemberton looks for an opening...',
      'GOAL! 1 - 0 to Canada.',
    ]) {
      expect(spoken.some((s) => s.line.text === text)).toBe(true);
    }
    const goal = spoken.find((s) => s.line.text === 'GOAL! 1 - 0 to Canada.');
    expect(goal?.interrupted).toBe(false);
    const idx = (t: string) => spoken.findIndex((s) => s.line.text === t);
    expect(idx('Build-up play here...')).toBeLessThan(idx('Pemberton looks for an opening...'));
    expect(idx('Pemberton looks for an opening...')).toBeLessThan(idx('GOAL! 1 - 0 to Canada.'));
  });

  it('takes turns: the lead calls events, the analyst reacts and fills', () => {
    const speakers = new Set(spoken.map((s) => s.line.speaker));
    expect(speakers).toEqual(new Set(['lead', 'analyst']));
    const goalIdx = spoken.findIndex((s) => s.line.text === 'GOAL! 1 - 0 to Canada.');
    expect(spoken[goalIdx]?.line.speaker).toBe('lead');
    expect(spoken.slice(goalIdx + 1, goalIdx + 3).some((s) => s.line.speaker === 'analyst')).toBe(
      true,
    );
    // Every interruption is an analyst or interruptible lead line giving way to a more important one.
    for (const s of spoken.filter((x) => x.interrupted)) expect(s.line.interruptible).toBe(true);
  });

  it('reacts to each event quickly and never speaks stale lines', () => {
    for (const s of spoken) expect(s.start).toBeLessThan(s.line.expiresAt);
  });

  it('does not repeat itself immediately', () => {
    for (let i = 1; i < spoken.length; i++)
      expect(spoken[i]?.line.text).not.toBe(spoken[i - 1]?.line.text);
  });

  it('ends with the final whistle and the right score', () => {
    expect(spoken.some((s) => s.line.text === 'The final result is 1 - 1.')).toBe(true);
    expect(formatScript(spoken, START)).toMatch(/^\[\d{2}:\d{2}\] (LEAD|ANALYST) \(/);
  });

  it('works with one commentator', () => {
    const solo = run(true);
    expect(solo.longestSilenceMs).toBeLessThanOrEqual(SILENCE_LIMIT);
    expect(new Set(solo.transcript.map((s) => s.line.speaker))).toEqual(new Set(['lead']));
  });
});
