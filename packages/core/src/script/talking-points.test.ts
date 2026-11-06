import { describe, expect, it } from 'vitest';
import { eventGroup } from '../model/event-types';
import type { ContextFact, MatchEvent, MatchHeader, Team } from '../model/types';
import { seededRandom } from './rng';
import {
  createTalkingPoints,
  factsFromEvent,
  factsFromHeader,
  FILLER_PRIORITY,
  groupThousands,
  situationWeight,
  type MatchSituation,
} from './talking-points';

const home: Team = {
  id: 1,
  name: 'FC Cacio Pepe',
  shortName: 'Cacio',
  lineup: [
    { id: 10, name: 'Arakcheev', roleId: 100 },
    { id: 11, name: 'Santarelli', roleId: 101 },
  ],
  setPieceTakerId: 11,
};
const away: Team = {
  id: 2,
  name: 'Soyboys',
  shortName: 'Soyboys',
  lineup: [{ id: 20, name: 'Hõbemägi', roleId: 100 }],
};
const header: MatchHeader = {
  matchId: 1,
  sourceSystem: 'Hattrick',
  matchType: 1,
  matchDate: '2026-10-24T11:15:00',
  home,
  away,
};

const at = (
  minute: number,
  now = minute * 60_000,
  score = { home: 0, away: 0 },
): MatchSituation => ({
  now,
  minute,
  score,
  home,
  away,
});

const facts: ContextFact[] = [
  { id: 'weather', kind: 'weather', data: { weather: 'rain' }, relevance: 0.7 },
  { id: 'attendance', kind: 'attendance', data: { spectators: 17417 }, relevance: 0.5 },
  {
    id: 'stakes.465',
    kind: 'stakes',
    side: 'home',
    text: 'Cacio need a win to stay in the title race.',
    relevance: 0.6,
  },
  {
    id: 'formation.home',
    kind: 'formation',
    side: 'home',
    data: { formation: '2-5-3' },
    relevance: 0.6,
  },
  {
    id: 'form.804',
    kind: 'form',
    side: 'home',
    text: 'Cacio have had a great run in recent matches.',
    relevance: 0.6,
  },
];

describe('talking points ranking', () => {
  it('prefers weather and formations early and stakes late in a close game', () => {
    expect(situationWeight('weather', at(5))).toBeGreaterThan(situationWeight('weather', at(70)));
    expect(situationWeight('stakes', at(75, 0, { home: 1, away: 1 }))).toBeGreaterThan(
      situationWeight('stakes', at(10)),
    );
    expect(situationWeight('score', at(-2))).toBe(0);
  });

  it('opens with the most relevant early fact', () => {
    const tp = createTalkingPoints({ random: seededRandom(1) });
    tp.add(facts);
    const line = tp.next(at(3));
    expect(line.factId).toBe('weather');
    expect(line.text).toContain('raining');
    expect(line).toMatchObject({
      speaker: 'analyst',
      priority: FILLER_PRIORITY,
      interruptible: true,
    });
    expect(line.expiresAt).toBeGreaterThan(3 * 60_000);
  });

  it('talks about the stakes late in a close match', () => {
    const tp = createTalkingPoints({ random: seededRandom(1) });
    tp.add(facts);
    expect(tp.next(at(78, undefined, { home: 1, away: 1 })).factId).toBe('stakes.465');
  });
});

describe('talking points repetition', () => {
  it('never repeats a line, a fact or a topic immediately', () => {
    const tp = createTalkingPoints({ random: seededRandom(2) });
    tp.add(facts);
    const lines = Array.from({ length: 30 }, (_, i) => tp.next(at(10 + i, (10 + i) * 15_000)));
    const kindOf = (id: string | undefined) => (id ?? '').split('.')[0];
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]?.text).not.toBe(lines[i - 1]?.text);
      if (lines[i]?.factId !== 'atmosphere') {
        expect(lines[i]?.factId).not.toBe(lines[i - 1]?.factId);
        expect(kindOf(lines[i]?.factId)).not.toBe(kindOf(lines[i - 1]?.factId));
      }
    }
  });

  it('respects the fact cooldown', () => {
    const tp = createTalkingPoints({ random: seededRandom(3), factCooldownMs: 10 * 60_000 });
    tp.add(facts);
    const used: { id: string | undefined; at: number }[] = [];
    for (let t = 0; t < 30; t++) {
      const now = t * 60_000;
      used.push({ id: tp.next(at(10 + t, now)).factId, at: now });
    }
    for (const fact of facts) {
      const times = used.filter((u) => u.id === fact.id).map((u) => u.at);
      for (let i = 1; i < times.length; i++)
        expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });

  it('always has something to say, even with no facts', () => {
    const tp = createTalkingPoints({ random: seededRandom(4) });
    const lines = Array.from({ length: 20 }, (_, i) => tp.next(at(-3 + i, i * 10_000)));
    expect(lines.every((l) => l.text.length > 0 && !l.text.includes('{'))).toBe(true);
    expect(lines.some((l) => l.factId === 'atmosphere')).toBe(true);
    expect(lines.some((l) => l.factId === 'score' && l.text.includes('Cacio 0, Soyboys 0'))).toBe(
      true,
    );
  });

  it('holds back facts that were just read out', () => {
    const tp = createTalkingPoints({ random: seededRandom(6), factCooldownMs: 5 * 60_000 });
    tp.add([facts[0] as ContextFact], 0);
    expect(tp.next(at(3, 60_000)).factId).not.toBe('weather');
    expect(tp.next(at(9, 6 * 60_000)).factId).toBe('weather');
  });

  it('ignores duplicate facts', () => {
    const tp = createTalkingPoints({ random: seededRandom(5) });
    tp.add(facts);
    tp.add(facts);
    expect(tp.facts).toHaveLength(facts.length);
  });
});

describe('fact extraction', () => {
  const ev = (typeId: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({
    index: 1,
    minute: -2,
    part: 0,
    key: `${typeId}_1`,
    typeId,
    variant: 1,
    group: eventGroup(typeId),
    beats: [],
    ...extra,
  });

  it('reads weather, attendance and formations from event data', () => {
    expect(
      factsFromEvent(
        ev(32, { data: { kind: 'weather', weather: 'fair', venue: 'stadium', spectators: 17417 } }),
      ),
    ).toEqual([
      { id: 'weather', kind: 'weather', data: { weather: 'fair' }, relevance: 0.7 },
      { id: 'attendance', kind: 'attendance', data: { spectators: 17417 }, relevance: 0.5 },
    ]);
    const shapes = factsFromEvent(
      ev(23, {
        data: {
          kind: 'formations',
          home: { defenders: 2, midfielders: 5, attackers: 3, label: '2-5-3' },
          away: { defenders: 2, midfielders: 5, attackers: 3, label: '2-5-3' },
        },
      }),
    );
    expect(shapes.map((f) => f.id)).toEqual(['formation.home', 'formation.away']);
  });

  it('keeps Hattrick sentences for context events', () => {
    const [fact] = factsFromEvent(
      ev(804, {
        side: 'home',
        beats: [{ text: 'Cacio have had a great run in recent matches.', mentions: [] }],
      }),
    );
    expect(fact).toMatchObject({
      kind: 'form',
      side: 'home',
      text: 'Cacio have had a great run in recent matches.',
    });
    expect(factsFromEvent(ev(25))).toEqual([expect.objectContaining({ kind: 'derby' })]);
    expect(factsFromEvent(ev(121))).toEqual([]);
  });

  it('builds player facts from the lineups', () => {
    const list = factsFromHeader(header);
    expect(list.map((f) => f.id)).toEqual(['setpieces.home', 'keeper.home', 'keeper.away']);
    expect(list[0]?.text).toBe('Santarelli takes the set pieces for Cacio.');
  });

  it('groups thousands without depending on the locale', () => {
    expect(groupThousands(17417)).toBe('17,417');
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(1234567)).toBe('1,234,567');
  });
});
