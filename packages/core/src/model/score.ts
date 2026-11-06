import { isGoalType, shootoutOutcome } from './event-types';
import type { MatchEvent, Score } from './types';

/**
 * Running score after the given events, counted from goal events (100-199) with a resolved side.
 * CHPP sends HomeGoals/AwayGoals only at match level, so the live score must be derived.
 */
export function runningScore(events: readonly MatchEvent[]): Score {
  const score: Score = { home: 0, away: 0 };
  for (const e of events) {
    if (isGoalType(e.typeId) && e.side) score[e.side] += 1;
  }
  return score;
}

/** Penalty shoot-out tally (event 56 scored, 58/59 missed). */
export function shootoutScore(events: readonly MatchEvent[]): Score {
  const score: Score = { home: 0, away: 0 };
  for (const e of events) {
    if (e.part === 4 && shootoutOutcome(e.typeId) === 'scored' && e.side) score[e.side] += 1;
  }
  return score;
}
