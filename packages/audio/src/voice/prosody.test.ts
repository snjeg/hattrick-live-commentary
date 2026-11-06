import { MOODS } from '@hlc/core';
import { describe, expect, it } from 'vitest';
import { mapProsody } from './prosody';

describe('mapProsody', () => {
  it('is neutral at zero intensity', () => {
    for (const mood of MOODS)
      expect(mapProsody(mood, 0, 'lead')).toEqual(mapProsody('neutral', 1, 'lead'));
  });

  it('raises rate and pitch for excitement and lowers them for disappointment', () => {
    const neutral = mapProsody('neutral', 1, 'lead');
    const excited = mapProsody('excited', 1, 'lead');
    const down = mapProsody('disappointed', 1, 'lead');
    expect(excited.rate).toBeGreaterThan(neutral.rate);
    expect(excited.pitch).toBeGreaterThan(neutral.pitch);
    expect(down.rate).toBeLessThan(neutral.rate);
    expect(down.pitch).toBeLessThan(neutral.pitch);
  });

  it('scales with intensity', () => {
    expect(mapProsody('excited', 0.5, 'lead').rate).toBeLessThan(
      mapProsody('excited', 1, 'lead').rate,
    );
  });

  it('keeps the analyst slower and lower than the lead', () => {
    const lead = mapProsody('neutral', 1, 'lead');
    const analyst = mapProsody('neutral', 1, 'analyst');
    expect(analyst.rate).toBeLessThan(lead.rate);
    expect(analyst.pitch).toBeLessThan(lead.pitch);
  });

  it('stays within safe ranges for every mood and out-of-range intensity', () => {
    for (const mood of MOODS) {
      for (const intensity of [-5, 0, 0.5, 1, 7, Number.NaN]) {
        for (const speaker of ['lead', 'analyst'] as const) {
          const p = mapProsody(mood, intensity, speaker);
          expect(p.rate).toBeGreaterThanOrEqual(0.7);
          expect(p.rate).toBeLessThanOrEqual(1.5);
          expect(p.pitch).toBeGreaterThanOrEqual(0.5);
          expect(p.pitch).toBeLessThanOrEqual(1.6);
          expect(p.volume).toBeGreaterThanOrEqual(0.3);
          expect(p.volume).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
