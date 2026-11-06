import { describe, expect, it } from 'vitest';
import { eventGroup } from './event-types';
import { runningScore, shootoutScore } from './score';
import type { MatchEvent, MatchPart, Side } from './types';

function ev(typeId: number, side: Side | undefined, part: MatchPart = 1): MatchEvent {
  return {
    index: 0,
    minute: 10,
    part,
    key: `${typeId}_1`,
    typeId,
    variant: 1,
    group: eventGroup(typeId),
    beats: [],
    ...(side ? { side } : {}),
  };
}

describe('runningScore', () => {
  it('counts goals by side and ignores misses and unresolved sides', () => {
    const events = [
      ev(103, 'home'),
      ev(171, 'away'),
      ev(283, 'away'),
      ev(181, 'away'),
      ev(121, undefined),
    ];
    expect(runningScore(events)).toEqual({ home: 1, away: 2 });
  });
});

describe('shootoutScore', () => {
  it('counts scored kicks in part 4 only', () => {
    const events = [
      ev(56, 'home', 4),
      ev(59, 'away', 4),
      ev(56, 'away', 4),
      ev(58, 'home', 4),
      ev(56, 'home', 2),
    ];
    expect(shootoutScore(events)).toEqual({ home: 1, away: 1 });
  });
});
