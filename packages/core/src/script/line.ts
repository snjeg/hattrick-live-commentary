import type { MatchEvent, Score, Team } from '../model/types';
import type { Mood, Speaker } from '../model/voice';

/**
 * One spoken line. Play-by-play (`lead`) calls the action: who, where, what. The `analyst`
 * explains how and why. Lines are short, interruptible where it makes sense, and expire.
 */
export interface Line {
  /** Unique per line instance. */
  id: string;
  speaker: Speaker;
  text: string;
  mood: Mood;
  /** 0..1 */
  intensity: number;
  /** Higher wins the floor. Lead event calls outrank analyst talk and gap fillers. */
  priority: number;
  /** May be cut off by a more important line. */
  interruptible: boolean;
  /** Epoch ms after which the line is stale and must not be spoken. */
  expiresAt: number;
  /** Sound cue to play with the line, if any. */
  cue?: string;
  /** Template variant that produced the line, for repetition tracking. */
  templateId?: string;
  /** Event the line reacts to. */
  eventIndex?: number;
  /** Context fact the line talks about. */
  factId?: string;
}

export interface EventLineContext {
  event: MatchEvent;
  home: Team;
  away: Team;
  /** Running score including this event. */
  score: Score;
  /** Wall-clock time the lines are written (epoch ms). */
  now: number;
}

/** Writes lines for events. Templates first; an AI writer can implement this later. */
export interface LineWriter {
  linesForEvent(context: EventLineContext): Line[];
}
