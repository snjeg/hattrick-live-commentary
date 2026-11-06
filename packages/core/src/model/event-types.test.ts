import { describe, expect, it } from 'vitest';
import {
  cardKind,
  classifyEventType,
  eventCategory,
  isKnownEventType,
  chanceInfo,
  chanceSituation,
  eventGroup,
  goalFor,
  isGoalType,
  isMissType,
  missFor,
  parseEventKey,
  shootoutOutcome,
  venueWeather,
} from './event-types';

describe('goal and miss mirror rule (+100)', () => {
  it('maps every goal ID to the miss ID 100 higher and back', () => {
    for (let goal = 100; goal <= 199; goal++) {
      const miss = missFor(goal);
      expect(miss).toBe(goal + 100);
      expect(isGoalType(goal)).toBe(true);
      expect(isMissType(miss)).toBe(true);
      expect(goalFor(miss)).toBe(goal);
      expect(eventGroup(goal)).toBe('goal');
      expect(eventGroup(miss)).toBe('miss');
      expect(chanceSituation(goal)).toBe(chanceSituation(miss));
    }
  });

  it('matches the pairs seen in real data', () => {
    // 121 goal / 221 miss, 134 penalty goal / 234 penalty miss, 183 / 283, 119 / 219.
    expect(missFor(121)).toBe(221);
    expect(missFor(134)).toBe(234);
    expect(goalFor(283)).toBe(183);
    expect(goalFor(219)).toBe(119);
  });

  it('rejects IDs outside the goal and miss ranges', () => {
    expect(() => missFor(99)).toThrow(RangeError);
    expect(() => missFor(200)).toThrow(RangeError);
    expect(() => goalFor(199)).toThrow(RangeError);
    expect(() => goalFor(300)).toThrow(RangeError);
    expect(chanceSituation(510)).toBeUndefined();
  });
});

describe('eventGroup', () => {
  it.each([
    [598, 'kickoff'],
    [597, 'secondHalf'],
    [599, 'fullTime'],
    [45, 'halfTime'],
    [70, 'extraTime'],
    [71, 'penaltyShootout'],
    [56, 'penaltyShootout'],
    [75, 'addedTime'],
    [20, 'formation'],
    [24, 'formation'],
    [21, 'lineup'],
    [25, 'derby'],
    [26, 'neutralGround'],
    [27, 'awayIsHome'],
    [28, 'walkover'],
    [38, 'venue'],
    [47, 'possession'],
    [80, 'teamNews'],
    [307, 'specialEvent'],
    [513, 'card'],
    [596, 'extraTime'],
    [802, 'form'],
    [807, 'possession'],
    [812, 'story'],
    [32, 'venue'],
    [37, 'venue'],
    [40, 'possession'],
    [41, 'bestPlayer'],
    [42, 'worstPlayer'],
    [401, 'injury'],
    [424, 'injury'],
    [454, 'injury'],
    [464, 'attendance'],
    [471, 'possession'],
    [510, 'card'],
    [514, 'card'],
    [550, 'stats'],
    [601, 'result'],
    [604, 'result'],
    [703, 'managerQuote'],
    [804, 'form'],
    [811, 'headToHead'],
    [880, 'assist'],
    [332, 'tactic'],
    [64, 'organisation'],
    [390, 'weatherEffect'],
  ] as const)('%i is %s', (id, group) => {
    expect(eventGroup(id)).toBe(group);
  });

  it('returns unknown for undocumented IDs', () => {
    expect(eventGroup(1)).toBe('unknown');
    expect(eventGroup(999)).toBe('unknown');
  });
});

describe('helpers', () => {
  it('parses event keys', () => {
    expect(parseEventKey('121_1')).toEqual({ typeId: 121, variant: 1 });
    expect(parseEventKey(' 599_3 ')).toEqual({ typeId: 599, variant: 3 });
    expect(parseEventKey('abc')).toBeUndefined();
    expect(parseEventKey('121')).toBeUndefined();
  });

  it('maps venue weather from real data', () => {
    expect(venueWeather(30)).toEqual({ weather: 'rain', venue: 'stadium' });
    expect(venueWeather(33)).toEqual({ weather: 'sunny', venue: 'stadium' });
    expect(venueWeather(36)).toEqual({ weather: 'rain', venue: 'neutral' });
    expect(venueWeather(38)).toEqual({ weather: 'fair', venue: 'neutral' });
    expect(venueWeather(34)).toBeUndefined();
  });

  it('classifies cards and shoot-out kicks', () => {
    expect(cardKind(510)).toBe('yellow');
    expect(cardKind(511)).toBe('yellow');
    expect(cardKind(512)).toBe('secondYellow');
    expect(cardKind(514)).toBe('red');
    expect(cardKind(513)).toBe('secondYellow');
    expect(cardKind(515)).toBeUndefined();
    expect(shootoutOutcome(55)).toBe('scored');
    expect(shootoutOutcome(56)).toBe('scored');
    expect(shootoutOutcome(57)).toBe('scored');
    expect(shootoutOutcome(58)).toBe('missed');
    expect(shootoutOutcome(59)).toBe('missed');
    expect(shootoutOutcome(71)).toBeUndefined();
  });
});

describe('chanceInfo', () => {
  it('reads score context, situation and side from regular IDs', () => {
    expect(chanceInfo(121)).toEqual({
      goal: true,
      context: 'lead',
      situation: 'middle',
      side: 'home',
    });
    expect(chanceInfo(103)).toEqual({
      goal: true,
      context: 'reducing',
      situation: 'rightWing',
      side: 'home',
    });
    expect(chanceInfo(162)).toEqual({
      goal: true,
      context: 'equalizer',
      situation: 'leftWing',
      side: 'away',
    });
    expect(chanceInfo(183)).toEqual({
      goal: true,
      context: 'increase',
      situation: 'rightWing',
      side: 'away',
    });
    expect(chanceInfo(234)).toEqual({
      goal: false,
      context: 'increase',
      situation: 'penalty',
      side: 'home',
    });
    expect(chanceInfo(280)).toEqual({
      goal: false,
      context: 'increase',
      situation: 'freeKick',
      side: 'away',
    });
  });

  it('marks counter-attacks and special events, which carry no side', () => {
    expect(chanceInfo(142)).toEqual({
      goal: true,
      counter: true,
      special: true,
      situation: 'leftWing',
    });
    expect(chanceInfo(219)).toEqual({ goal: false, special: true });
    expect(chanceInfo(185)).toEqual({ goal: true, special: true });
    expect(chanceInfo(290)).toEqual({ goal: false, special: true });
    expect(chanceInfo(510)).toBeUndefined();
  });
});

describe('official event-type table', () => {
  it('knows the documented IDs and nothing else', () => {
    for (const id of [
      19, 28, 30, 35, 47, 55, 76, 80, 97, 100, 143, 190, 200, 243, 290, 311, 344, 391, 427, 498,
      505, 514, 596, 606, 651, 704, 822, 880,
    ]) {
      expect(isKnownEventType(id), String(id)).toBe(true);
    }
    for (const id of [
      0, 18, 29, 34, 48, 77, 82, 98, 144, 149, 188, 189, 191, 238, 244, 291, 300, 312, 337, 345,
      392, 428, 499, 506, 550, 595, 607, 705, 823, 881,
    ]) {
      expect(isKnownEventType(id), String(id)).toBe(false);
    }
  });

  it('sorts every documented ID into goal, chance, card, info or context', () => {
    expect([121, 162, 105, 141, 190, 55, 56, 57].map(eventCategory)).toEqual(Array(8).fill('goal'));
    expect([221, 262, 205, 241, 290, 58, 59].map(eventCategory)).toEqual(Array(7).fill('chance'));
    expect([510, 511, 512, 513, 514].map(eventCategory)).toEqual(Array(5).fill('card'));
    expect(
      [598, 597, 45, 599, 75, 70, 71, 401, 424, 454, 350, 332, 390, 40, 41, 61].map(eventCategory),
    ).toEqual(Array(16).fill('info'));
    expect(
      [19, 20, 21, 25, 26, 27, 30, 33, 36, 464, 465, 703, 802, 811, 812, 460, 80].map(
        eventCategory,
      ),
    ).toEqual(Array(17).fill('context'));
  });

  it('classifies in one call', () => {
    expect(classifyEventType(121)).toEqual({ group: 'goal', category: 'goal', known: true });
    expect(classifyEventType(550)).toEqual({ group: 'stats', category: 'info', known: false });
    expect(classifyEventType(999)).toEqual({ group: 'unknown', category: 'info', known: false });
  });
});
