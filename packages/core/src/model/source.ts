import type { MatchEvent, MatchHeader, Substitution } from './types';

/** New data since the previous poll. */
export interface MatchUpdate {
  events: MatchEvent[];
  substitutions: Substitution[];
  finished: boolean;
  /**
   * App-only: earliest epoch ms worth polling again. Derived from NextEventMinute-style data.
   * Never speak, show or hint at it.
   */
  nextPollAt?: number;
}

/**
 * A match feed. Live CHPP and the replay simulator implement the same interface,
 * so nothing downstream special-cases live mode.
 */
export interface MatchSource {
  /** Teams and lineups. Never final-result data. */
  open(): Promise<MatchHeader>;
  /** Everything that happened since the previous call, as of `nowMs`. */
  poll(nowMs: number): Promise<MatchUpdate>;
  close(): void;
}
