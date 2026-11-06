/** Who speaks a line: `lead` calls the action, `analyst` explains tactics, context and background. */
export type Speaker = 'lead' | 'analyst';

export const SPEAKERS: readonly Speaker[] = ['lead', 'analyst'];

/**
 * Emotional colour of a line. Scripts carry it so a better voice engine can express more without
 * rewriting the script.
 */
export type Mood =
  | 'calm'
  | 'neutral'
  | 'anticipation'
  | 'excited'
  | 'celebratory'
  | 'tense'
  | 'disappointed'
  | 'concerned';

export const MOODS: readonly Mood[] = [
  'calm',
  'neutral',
  'anticipation',
  'excited',
  'celebratory',
  'tense',
  'disappointed',
  'concerned',
];

/** Clamps an intensity to 0 (flat) .. 1 (maximum). */
export function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
