import { cardKind, type EventGroup, type MatchEvent } from '@hlc/core';

/** Placeholder sound cues, generated in the mixer until licence-clear clips are chosen. */
export type CueId =
  | 'whistleStart'
  | 'whistleHalfTime'
  | 'whistleFullTime'
  | 'whistleFoul'
  | 'roar'
  | 'gasp'
  | 'groan'
  | 'boo'
  | 'hush'
  | 'applause'
  | 'cheer';

export interface CrowdReaction {
  cue?: CueId;
  /** New crowd excitement 0..1 (the bed swells immediately, then decays). */
  excitement?: number;
}

/**
 * Cue and crowd reaction for an event, applied the moment the event is parsed; the spoken line
 * follows later. Every event group has an entry (unmapped groups react with nothing).
 */
const BY_GROUP: Record<EventGroup, CrowdReaction> = {
  kickoff: { cue: 'whistleStart', excitement: 0.55 },
  secondHalf: { cue: 'whistleStart', excitement: 0.45 },
  extraTime: { cue: 'whistleStart', excitement: 0.6 },
  halfTime: { cue: 'whistleHalfTime', excitement: 0.3 },
  fullTime: { cue: 'whistleFullTime', excitement: 0.7 },
  addedTime: { excitement: 0.5 },
  noAddedTime: {},
  goal: { cue: 'roar', excitement: 1 },
  miss: { cue: 'gasp', excitement: 0.7 },
  assist: {},
  card: { cue: 'whistleFoul', excitement: 0.55 },
  injury: { cue: 'hush', excitement: 0.2 },
  substitution: { cue: 'applause', excitement: 0.3 },
  tactic: {},
  manMarking: {},
  weatherEffect: {},
  specialEvent: { excitement: 0.5 },
  preMatch: {},
  lineup: { cue: 'applause', excitement: 0.35 },
  formation: {},
  derby: { cue: 'cheer', excitement: 0.6 },
  neutralGround: {},
  awayIsHome: {},
  walkover: {},
  teamNews: {},
  venue: { excitement: 0.35 },
  attendance: {},
  stakes: {},
  story: {},
  form: {},
  headToHead: {},
  fanReaction: { cue: 'cheer', excitement: 0.5 },
  managerQuote: {},
  possession: {},
  organisation: {},
  bestPlayer: { cue: 'applause' },
  worstPlayer: {},
  result: { cue: 'applause', excitement: 0.6 },
  penaltyShootout: { excitement: 0.85 },
  stats: {},
  unknown: {},
};

export function crowdReaction(event: Pick<MatchEvent, 'group' | 'typeId'>): CrowdReaction {
  if (event.group === 'card') {
    const kind = cardKind(event.typeId);
    return {
      cue: kind === 'yellow' ? 'whistleFoul' : 'boo',
      excitement: kind === 'yellow' ? 0.5 : 0.75,
    };
  }
  if (event.group === 'penaltyShootout') {
    if (event.typeId >= 55 && event.typeId <= 57) return { cue: 'roar', excitement: 1 };
    if (event.typeId === 58 || event.typeId === 59) return { cue: 'groan', excitement: 0.8 };
  }
  return BY_GROUP[event.group];
}
