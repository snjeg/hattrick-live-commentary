import { childInt, descendant, parseXml } from './xml';

/**
 * Parser for CHPP `matchdetails` 3.1, limited to fields whose location is documented in
 * docs/chpp-findings.md. More fields (arena name, referee, formations, tactics) wait for a real
 * fixture: see docs/open-questions.md.
 */

export interface MatchDetails {
  /** `Arena > WeatherID` (forecast for upcoming matches). Number-to-weather mapping unconfirmed. */
  weatherId?: number;
  /**
   * Final-result data. Never use while a match is live or replayed. Only `AddedMinutes` has a
   * documented name so far; ratings, chances, possession, scorers, bookings and injuries will
   * be added here once a real fixture shows their structure.
   */
  spoilers: { addedMinutes?: number };
}

export function parseMatchDetails(xml: string): MatchDetails {
  const doc = parseXml(xml);
  const arena = descendant(doc, 'Arena');
  const weatherId = childInt(arena, 'WeatherID');
  const addedEl = descendant(doc, 'AddedMinutes');
  const added =
    addedEl && /^\d+$/.test(addedEl.text.trim()) ? Number(addedEl.text.trim()) : undefined;
  return {
    ...(weatherId !== undefined ? { weatherId } : {}),
    spoilers: added !== undefined ? { addedMinutes: added } : {},
  };
}
