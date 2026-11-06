/**
 * Normalised match model. Everything downstream of the data adapters works on these types.
 * Times at module boundaries are epoch ms or ISO strings; minutes of play are integers.
 */

export type Side = 'home' | 'away';

/** 0 pre-match, 1 first half, 2 second half (stoppage time uses minutes 91+), 3 extra time, 4 shoot-out. */
export type MatchPart = 0 | 1 | 2 | 3 | 4;

export const MATCH_PARTS: readonly MatchPart[] = [0, 1, 2, 3, 4];

export function isMatchPart(value: number): value is MatchPart {
  return (MATCH_PARTS as readonly number[]).includes(value);
}

export interface Player {
  id: number;
  name: string;
  /** CHPP RoleID: 100 keeper, 101-105 defence, 106-110 midfield, 111-113 attack, 18 set-piece taker. */
  roleId: number;
  /** CHPP Behaviour 0-4; meaning unconfirmed. */
  behaviour?: number;
}

export interface Team {
  id: number;
  name: string;
  shortName: string;
  /** Starting lineup, without the extra set-piece-taker row (see `setPieceTakerId`). */
  lineup: Player[];
  setPieceTakerId?: number;
}

export interface Formation {
  defenders: number;
  midfielders: number;
  attackers: number;
  /** For example "3-5-2". */
  label: string;
}

export type WeatherState = 'rain' | 'cloudy' | 'fair' | 'sunny';

/** A name the event text marks up as a player or team. */
export interface Mention {
  kind: 'player' | 'team';
  name: string;
  side?: Side;
  playerId?: number;
}

/** One line of an event text: a single dramatic beat, spoken on its own. */
export interface Beat {
  text: string;
  mentions: Mention[];
}

/** Structured facts a parser could read from an event's numeric fields. */
export type EventData =
  | { kind: 'formation'; side?: Side; formation: Formation }
  | { kind: 'formations'; home?: Formation; away?: Formation }
  | {
      kind: 'weather';
      weather: WeatherState;
      venue: 'stadium' | 'neutral';
      /** 30-33: arena ID, sold seats and total seats. */
      arenaId?: number;
      spectators?: number;
      capacity?: number;
    }
  | { kind: 'attendance'; spectators: number }
  | { kind: 'injuryWeeks'; weeks: number }
  | { kind: 'organisation'; level: number }
  | { kind: 'addedTime'; minutes: number }
  | { kind: 'possession'; percent: number; side?: Side };

export type EventGroup =
  | 'kickoff'
  | 'halfTime'
  | 'secondHalf'
  | 'extraTime'
  | 'fullTime'
  | 'addedTime'
  | 'noAddedTime'
  | 'goal'
  | 'miss'
  | 'assist'
  | 'card'
  | 'injury'
  | 'substitution'
  | 'tactic'
  | 'manMarking'
  | 'weatherEffect'
  | 'preMatch'
  | 'lineup'
  | 'formation'
  | 'derby'
  | 'neutralGround'
  | 'awayIsHome'
  | 'walkover'
  | 'teamNews'
  | 'specialEvent'
  | 'venue'
  | 'attendance'
  | 'stakes'
  | 'story'
  | 'form'
  | 'headToHead'
  | 'fanReaction'
  | 'managerQuote'
  | 'possession'
  | 'organisation'
  | 'bestPlayer'
  | 'worstPlayer'
  | 'result'
  | 'penaltyShootout'
  | 'stats'
  | 'unknown';

export interface MatchEvent {
  /** CHPP event index. Has gaps; may start at 0 or 1. */
  index: number;
  /** Minute of play. Negative (-3 to -1) for pre-match events. */
  minute: number;
  part: MatchPart;
  /** Raw CHPP EventKey, `<EventTypeID>_<variant>`. */
  key: string;
  typeId: number;
  variant: number;
  group: EventGroup;
  /** Team the event belongs to, when it could be resolved. */
  side?: Side;
  /** Unsupported CHPP ID fields, kept raw (0 is dropped). Do not rely on them. */
  subjectTeamId?: number;
  subjectPlayerId?: number;
  objectPlayerId?: number;
  /** Event text split into beats. Empty in report mode when CHPP sends no text. */
  beats: Beat[];
  data?: EventData;
}

export interface Substitution {
  teamId: number;
  side?: Side;
  playerOutId: number;
  playerInId: number;
  orderType: number;
  newPositionId: number;
  newPositionBehaviour: number;
  minute: number;
}

export interface Score {
  home: number;
  away: number;
}

/** What is known before kick-off: safe to use at any time. */
export interface MatchHeader {
  matchId: number;
  sourceSystem: string;
  matchType: number;
  /** ISO string as sent by CHPP (Hattrick local time, no zone). */
  matchDate: string;
  home: Team;
  away: Team;
}

/**
 * Data that reveals the outcome. Never use while a match is live or being replayed.
 * Kept separate so it cannot be read by accident.
 */
export interface Spoilers {
  /** Match-level HomeGoals/AwayGoals as of fetch time. */
  reportedScore?: Score;
}

/** App-only polling hint from CHPP. Never speak, show or hint at it. */
export interface PollHint {
  nextEventMinute: number;
  nextEventMatchPart: MatchPart;
}

export interface Match extends MatchHeader {
  events: MatchEvent[];
  substitutions: Substitution[];
  lastShownEventIndex?: number;
  pollHint?: PollHint;
  spoilers: Spoilers;
}

export type ContextFactKind =
  | 'weather'
  | 'arena'
  | 'attendance'
  | 'derby'
  | 'neutralGround'
  | 'standings'
  | 'form'
  | 'headToHead'
  | 'manager'
  | 'formation'
  | 'player'
  | 'stakes'
  | 'story';

/** A background fact the commentators can talk about between events. */
export interface ContextFact {
  /** Stable id, used for cooldowns. */
  id: string;
  kind: ContextFactKind;
  side?: Side;
  /** Ready-to-speak sentence, if the source provides one. */
  text?: string;
  data?: Readonly<Record<string, string | number>>;
  /** Base relevance 0..1 before cooldown and match situation. */
  relevance: number;
}
