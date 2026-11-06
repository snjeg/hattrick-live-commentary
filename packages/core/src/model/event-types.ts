import type { EventCategory, EventGroup, Side, WeatherState } from './types';

/**
 * EventTypeID to group table, from the official list in docs/chpp-event-types.md.
 * Exact IDs first, then ranges; the first match wins. 550 is undocumented (seen in real data).
 */
const EXACT: ReadonlyMap<number, EventGroup> = new Map<number, EventGroup>([
  // Pre-match and info
  [19, 'preMatch'],
  [20, 'formation'],
  [21, 'lineup'],
  [22, 'preMatch'],
  [23, 'formation'],
  [24, 'formation'],
  [25, 'derby'],
  [26, 'neutralGround'],
  [27, 'awayIsHome'],
  [28, 'walkover'],
  // During and after
  [40, 'possession'],
  [41, 'bestPlayer'],
  [42, 'worstPlayer'],
  [43, 'stakes'],
  [44, 'stakes'],
  [45, 'halfTime'],
  [46, 'story'],
  [47, 'possession'],
  [68, 'tactic'],
  [70, 'extraTime'],
  [71, 'penaltyShootout'],
  [72, 'extraTime'],
  [73, 'penaltyShootout'],
  [74, 'extraTime'],
  [75, 'addedTime'],
  [76, 'noAddedTime'],
  [80, 'teamNews'],
  [81, 'teamNews'],
  [343, 'tactic'],
  [344, 'tactic'],
  [450, 'story'],
  [451, 'stakes'],
  [454, 'injury'],
  [464, 'attendance'],
  [473, 'injury'],
  [481, 'formation'],
  [494, 'possession'],
  [495, 'possession'],
  [550, 'stats'],
  [596, 'extraTime'],
  [597, 'secondHalf'],
  [598, 'kickoff'],
  [599, 'fullTime'],
  [802, 'form'],
  [803, 'form'],
  [804, 'form'],
  [810, 'headToHead'],
  [811, 'headToHead'],
  [816, 'possession'],
  [817, 'possession'],
  [880, 'assist'],
]);

const RANGES: ReadonlyArray<readonly [number, number, EventGroup]> = [
  [30, 39, 'venue'],
  [55, 59, 'penaltyShootout'],
  [60, 69, 'organisation'],
  [90, 97, 'injury'],
  [100, 199, 'goal'],
  [200, 299, 'miss'],
  [301, 306, 'weatherEffect'],
  [307, 311, 'specialEvent'],
  [331, 336, 'tactic'],
  [350, 352, 'substitution'],
  [360, 362, 'tactic'],
  [370, 372, 'tactic'],
  [380, 389, 'manMarking'],
  [390, 391, 'weatherEffect'],
  [401, 427, 'injury'],
  [452, 459, 'story'],
  [460, 463, 'fanReaction'],
  [465, 470, 'stakes'],
  [471, 472, 'possession'],
  [474, 477, 'preMatch'],
  [478, 480, 'stakes'],
  [482, 488, 'preMatch'],
  [489, 493, 'story'],
  [496, 497, 'stakes'],
  [498, 498, 'story'],
  [500, 505, 'walkover'],
  [510, 514, 'card'],
  [601, 606, 'result'],
  [650, 651, 'story'],
  [700, 704, 'managerQuote'],
  [806, 809, 'possession'],
  [800, 822, 'story'],
];

/**
 * Every EventTypeID listed in docs/chpp-event-types.md. 550 is seen in real data but undocumented,
 * so it is not here. IDs outside this set are logged by the parser.
 */
const DOCUMENTED: ReadonlyArray<number | readonly [number, number]> = [
  [19, 28],
  [30, 33],
  [35, 47],
  [55, 76],
  [80, 81],
  [90, 97],
  // Goals: regular home 10x-13x, away 15x-18x (last digit 0-4), special events, counter-attacks.
  [100, 104],
  [110, 114],
  [120, 124],
  [130, 134],
  [150, 154],
  [160, 164],
  [170, 174],
  [180, 184],
  [105, 109],
  [115, 119],
  125,
  [135, 143],
  [185, 187],
  190,
  // Chances without a goal: the +100 mirror, plus their own special events.
  [200, 204],
  [210, 214],
  [220, 224],
  [230, 234],
  [250, 254],
  [260, 264],
  [270, 274],
  [280, 284],
  [205, 209],
  [215, 219],
  225,
  [235, 237],
  [239, 243],
  [285, 290],
  [301, 311],
  [331, 336],
  [343, 344],
  [350, 352],
  [360, 362],
  [370, 372],
  [380, 391],
  [401, 427],
  [450, 498],
  [500, 505],
  [510, 514],
  [596, 599],
  [601, 606],
  [650, 651],
  [700, 704],
  [800, 822],
  880,
];

const KNOWN: ReadonlySet<number> = new Set(
  DOCUMENTED.flatMap((entry) => {
    if (typeof entry === 'number') return [entry];
    const [from, to] = entry;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }),
);

/** True when the type ID is in the official event-type table. */
export function isKnownEventType(typeId: number): boolean {
  return KNOWN.has(typeId);
}

/** Groups whose events are background for the analyst rather than match action. */
const CONTEXT_GROUPS: ReadonlySet<EventGroup> = new Set<EventGroup>([
  'preMatch',
  'lineup',
  'formation',
  'derby',
  'neutralGround',
  'awayIsHome',
  'teamNews',
  'venue',
  'attendance',
  'stakes',
  'story',
  'form',
  'headToHead',
  'fanReaction',
  'managerQuote',
]);

/** goal / chance / card / info / context, from the official ID ranges. Unknown IDs count as info. */
export function eventCategory(typeId: number): EventCategory {
  if (isGoalType(typeId) || shootoutOutcome(typeId) === 'scored') return 'goal';
  if (isMissType(typeId) || shootoutOutcome(typeId) === 'missed') return 'chance';
  if (cardKind(typeId)) return 'card';
  return CONTEXT_GROUPS.has(eventGroup(typeId)) ? 'context' : 'info';
}

/** Group, category and whether the ID is documented, in one call. */
export function classifyEventType(typeId: number): {
  group: EventGroup;
  category: EventCategory;
  known: boolean;
} {
  return {
    group: eventGroup(typeId),
    category: eventCategory(typeId),
    known: isKnownEventType(typeId),
  };
}

export function eventGroup(typeId: number): EventGroup {
  const exact = EXACT.get(typeId);
  if (exact) return exact;
  for (const [from, to, group] of RANGES) {
    if (typeId >= from && typeId <= to) return group;
  }
  return 'unknown';
}

/** Goals are 100-199; each goal ID plus 100 is the matching missed chance (e.g. 121 and 221). */
export function isGoalType(typeId: number): boolean {
  return typeId >= 100 && typeId <= 199;
}

export function isMissType(typeId: number): boolean {
  return typeId >= 200 && typeId <= 299;
}

/** The missed-chance ID that mirrors a goal ID (+100 rule). */
export function missFor(goalTypeId: number): number {
  if (!isGoalType(goalTypeId)) throw new RangeError(`${goalTypeId} is not a goal event type`);
  return goalTypeId + 100;
}

/** The goal ID that mirrors a missed-chance ID (+100 rule). */
export function goalFor(missTypeId: number): number {
  if (!isMissType(missTypeId))
    throw new RangeError(`${missTypeId} is not a missed-chance event type`);
  return missTypeId - 100;
}

/**
 * The scoring situation shared by a goal and its mirrored miss, so 121 and 221 map to the same value.
 * Returns undefined for other events.
 */
export function chanceSituation(typeId: number): number | undefined {
  if (isGoalType(typeId)) return typeId;
  if (isMissType(typeId)) return typeId - 100;
  return undefined;
}

/** Penalty shoot-out kick: 55-57 scored, 58-59 no goal (official list). */
export function shootoutOutcome(typeId: number): 'scored' | 'missed' | undefined {
  if (typeId >= 55 && typeId <= 57) return 'scored';
  if (typeId === 58 || typeId === 59) return 'missed';
  return undefined;
}

/** Cards: 510/511 yellow (nasty play, cheating), 512/513 red after a second warning, 514 straight red. */
export function cardKind(typeId: number): 'yellow' | 'secondYellow' | 'red' | undefined {
  if (typeId === 510 || typeId === 511) return 'yellow';
  if (typeId === 512 || typeId === 513) return 'secondYellow';
  if (typeId === 514) return 'red';
  return undefined;
}

/** Weather from venue events: 30-33 spectators and venue, 36-39 venue only (official list). */
export function venueWeather(
  typeId: number,
): { weather: WeatherState; venue: 'stadium' | 'neutral' } | undefined {
  const stadium: Record<number, WeatherState> = {
    30: 'rain',
    31: 'cloudy',
    32: 'fair',
    33: 'sunny',
  };
  const neutral: Record<number, WeatherState> = {
    36: 'rain',
    37: 'cloudy',
    38: 'fair',
    39: 'sunny',
  };
  const s = stadium[typeId];
  if (s) return { weather: s, venue: 'stadium' };
  const n = neutral[typeId];
  if (n) return { weather: n, venue: 'neutral' };
  return undefined;
}

export type ScoreContext = 'reducing' | 'equalizer' | 'lead' | 'increase';
export type ChanceSituation = 'freeKick' | 'middle' | 'leftWing' | 'rightWing' | 'penalty';

export interface ChanceInfo {
  goal: boolean;
  /** What the goal does (or would have done) to the score, from the attacking team's view. */
  context?: ScoreContext;
  situation?: ChanceSituation;
  /** Counter-attack chances 140-143 / 240-243. */
  counter?: boolean;
  /** Special-event chance. These IDs are shared by both teams. */
  special?: boolean;
  /** Attacking side implied by a regular (non-special) ID. */
  side?: Side;
}

const CONTEXTS: ScoreContext[] = ['reducing', 'equalizer', 'lead', 'increase'];
const SITUATIONS: ChanceSituation[] = ['freeKick', 'middle', 'leftWing', 'rightWing', 'penalty'];

/**
 * Reads a goal (1xx) or missed chance (2xx) ID. Regular IDs: tens digit 0-3 home, 5-8 away
 * (reducing, equalizer, lead, increase); last digit 0-4 the situation. 140-143 are counter-attacks;
 * other IDs are special events.
 */
export function chanceInfo(typeId: number): ChanceInfo | undefined {
  const base = chanceSituation(typeId);
  if (base === undefined) return undefined;
  const goal = isGoalType(typeId);
  const tens = Math.floor((base - 100) / 10);
  const unit = base % 10;
  if (tens === 4 && unit <= 3)
    return { goal, counter: true, special: true, situation: SITUATIONS[unit] as ChanceSituation };
  if (unit <= 4 && ((tens >= 0 && tens <= 3) || (tens >= 5 && tens <= 8))) {
    const away = tens >= 5;
    return {
      goal,
      context: CONTEXTS[away ? tens - 5 : tens] as ScoreContext,
      situation: SITUATIONS[unit] as ChanceSituation,
      side: away ? 'away' : 'home',
    };
  }
  return { goal, special: true };
}

/** Splits an EventKey such as "121_1" into type ID and variant. */
export function parseEventKey(key: string): { typeId: number; variant: number } | undefined {
  const m = /^(\d+)_(\d+)$/.exec(key.trim());
  if (!m) return undefined;
  return { typeId: Number(m[1]), variant: Number(m[2]) };
}
