import type { EventGroup, WeatherState } from './types';

/**
 * EventTypeID to group table. Sources: docs/chpp-findings.md (documented ranges) and
 * docs/chpp-live-texts-findings.md (real data, which wins where they differ).
 * Exact IDs are listed first; ranges after. The first match wins.
 */
const EXACT: ReadonlyMap<number, EventGroup> = new Map<number, EventGroup>([
  // Match flow
  [598, 'kickoff'],
  [597, 'secondHalf'],
  [596, 'extraTime'],
  [70, 'extraTime'],
  [599, 'fullTime'],
  [45, 'halfTime'],
  [75, 'addedTime'],
  [76, 'noAddedTime'],
  [71, 'penaltyShootout'],
  [73, 'penaltyShootout'],
  // Pre-match
  [19, 'preMatch'],
  [20, 'formation'],
  [21, 'lineup'],
  [23, 'formation'],
  [24, 'formation'],
  [25, 'derby'],
  [27, 'neutralGround'],
  [28, 'managerAbsent'],
  [481, 'formation'],
  // End of match
  [40, 'possession'],
  [41, 'bestPlayer'],
  [42, 'worstPlayer'],
  [550, 'stats'],
  // Overrides inside wider ranges (real data)
  [454, 'injury'],
  [464, 'attendance'],
  [471, 'possession'],
  [61, 'organisation'],
  [64, 'organisation'],
  [65, 'organisation'],
  [703, 'fanReaction'],
  [804, 'form'],
  [811, 'headToHead'],
  [880, 'assist'],
]);

const RANGES: ReadonlyArray<readonly [number, number, EventGroup]> = [
  [30, 39, 'venue'],
  [55, 59, 'penaltyShootout'],
  [90, 97, 'injury'],
  [100, 199, 'goal'],
  [200, 299, 'miss'],
  [301, 311, 'weatherEffect'],
  [331, 336, 'tactic'],
  [350, 352, 'substitution'],
  [360, 362, 'tactic'],
  [370, 372, 'tactic'],
  [380, 389, 'manMarking'],
  [390, 391, 'weatherEffect'],
  [401, 427, 'injury'],
  [473, 473, 'injury'],
  [460, 463, 'fanReaction'],
  [450, 470, 'stakes'],
  [478, 480, 'stakes'],
  [496, 497, 'stakes'],
  [472, 472, 'preMatch'],
  [481, 488, 'preMatch'],
  [19, 47, 'preMatch'],
  [510, 514, 'card'],
  [601, 606, 'result'],
  [700, 704, 'managerQuote'],
  [800, 822, 'story'],
];

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

/** Penalty shoot-out outcome from real data: 56 scored, 58 missed wide, 59 saved or missed. */
export function shootoutOutcome(typeId: number): 'scored' | 'missed' | undefined {
  if (typeId === 56) return 'scored';
  if (typeId === 58 || typeId === 59) return 'missed';
  return undefined;
}

/** Card events: 510 yellow, 511 yellow for a minor offence, 512 second yellow and dismissal, 514 straight red. */
export function cardKind(typeId: number): 'yellow' | 'secondYellow' | 'red' | undefined {
  if (typeId === 510 || typeId === 511) return 'yellow';
  if (typeId === 512) return 'secondYellow';
  if (typeId === 514) return 'red';
  return undefined;
}

/**
 * Weather from venue events (real data): 30-33 at a real stadium, 36-39 at a neutral or tournament venue.
 * 38 has not been seen, so it is not mapped.
 */
export function venueWeather(
  typeId: number,
): { weather: WeatherState; venue: 'stadium' | 'neutral' } | undefined {
  const stadium: Record<number, WeatherState> = {
    30: 'rain',
    31: 'cloudy',
    32: 'fair',
    33: 'sunny',
  };
  const neutral: Record<number, WeatherState> = { 36: 'rain', 37: 'cloudy', 39: 'sunny' };
  const s = stadium[typeId];
  if (s) return { weather: s, venue: 'stadium' };
  const n = neutral[typeId];
  if (n) return { weather: n, venue: 'neutral' };
  return undefined;
}

/** Splits an EventKey such as "121_1" into type ID and variant. */
export function parseEventKey(key: string): { typeId: number; variant: number } | undefined {
  const m = /^(\d+)_(\d+)$/.exec(key.trim());
  if (!m) return undefined;
  return { typeId: Number(m[1]), variant: Number(m[2]) };
}
