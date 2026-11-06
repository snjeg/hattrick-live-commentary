import { describe, expect, it } from 'vitest';
import {
  cardKind,
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
    [27, 'neutralGround'],
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
    [703, 'fanReaction'],
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
    expect(venueWeather(38)).toBeUndefined();
  });

  it('classifies cards and shoot-out kicks', () => {
    expect(cardKind(510)).toBe('yellow');
    expect(cardKind(511)).toBe('yellow');
    expect(cardKind(512)).toBe('secondYellow');
    expect(cardKind(514)).toBe('red');
    expect(cardKind(513)).toBeUndefined();
    expect(shootoutOutcome(56)).toBe('scored');
    expect(shootoutOutcome(58)).toBe('missed');
    expect(shootoutOutcome(59)).toBe('missed');
    expect(shootoutOutcome(71)).toBeUndefined();
  });
});
