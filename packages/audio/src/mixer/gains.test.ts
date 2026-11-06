import { describe, expect, it } from 'vitest';
import {
  computeBusGains,
  dbToGain,
  decayExcitement,
  DEFAULT_MIX,
  gainToDb,
  type MixState,
} from './gains';

const base: MixState = { master: 0.8, muted: false, excitement: 0, voiceActive: false };
const db = (g: number) => Math.round(gainToDb(g) * 10) / 10;

describe('gain logic', () => {
  it('converts decibels', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-20)).toBeCloseTo(0.1);
    expect(dbToGain(-120)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('moves the crowd bed from floor to peak with excitement', () => {
    expect(db(computeBusGains(base).crowd)).toBe(DEFAULT_MIX.crowdFloorDb);
    expect(db(computeBusGains({ ...base, excitement: 1 }).crowd)).toBe(DEFAULT_MIX.crowdPeakDb);
    expect(db(computeBusGains({ ...base, excitement: 0.5 }).crowd)).toBe(-15);
  });

  it('ducks beds by bedDuckDb and cues less while a voice speaks', () => {
    const quiet = computeBusGains({ ...base, weather: 'rain' });
    const ducked = computeBusGains({ ...base, weather: 'rain', voiceActive: true });
    expect(db(ducked.crowd) - db(quiet.crowd)).toBe(DEFAULT_MIX.bedDuckDb);
    expect(db(ducked.weather) - db(quiet.weather)).toBe(DEFAULT_MIX.bedDuckDb);
    expect(db(ducked.cues) - db(quiet.cues)).toBe(DEFAULT_MIX.cueDuckDb);
    expect(ducked.cues).toBeGreaterThan(ducked.crowd * 0); // cues stay audible
  });

  it('has a weather bed only when the weather is known, loudest for rain', () => {
    expect(computeBusGains(base).weather).toBe(0);
    const rain = computeBusGains({ ...base, weather: 'rain' }).weather;
    const sunny = computeBusGains({ ...base, weather: 'sunny' }).weather;
    expect(rain).toBeGreaterThan(sunny);
    expect(sunny).toBeGreaterThan(0);
  });

  it('mutes and clamps the master volume', () => {
    expect(computeBusGains({ ...base, muted: true }).master).toBe(0);
    expect(computeBusGains({ ...base, master: 3 }).master).toBe(1);
    expect(computeBusGains({ ...base, master: -1 }).master).toBe(0);
    expect(computeBusGains({ ...base, excitement: Number.NaN }).crowd).toBe(
      computeBusGains(base).crowd,
    );
  });

  it('decays excitement back to rest', () => {
    expect(decayExcitement(1, 0)).toBe(1);
    expect(decayExcitement(1, 6, 6, 0)).toBeCloseTo(0.5);
    expect(decayExcitement(1, 600)).toBeCloseTo(0.15);
    expect(decayExcitement(0, 6, 6, 0.15)).toBeGreaterThan(0);
  });
});
