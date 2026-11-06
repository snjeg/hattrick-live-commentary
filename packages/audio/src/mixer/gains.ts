import type { WeatherState } from '@hlc/core';

/**
 * Pure gain logic for the soundscape. Layers, from bottom to top: continuous crowd bed and weather
 * bed, event cues, then voice (spoken by the VoiceProvider outside Web Audio, so the mixer ducks
 * the other layers while a line is being spoken).
 */

export interface MixState {
  /** 0..1 user volume. */
  master: number;
  muted: boolean;
  /** 0..1 crowd excitement; 0 is a murmur, 1 a full roar. */
  excitement: number;
  weather?: WeatherState;
  /** A commentator is speaking. */
  voiceActive: boolean;
}

export interface MixSettings {
  /** Bed level with no excitement, in dB. */
  crowdFloorDb: number;
  /** Bed level at full excitement, in dB. */
  crowdPeakDb: number;
  cueDb: number;
  /** How far beds drop under a voice, in dB (negative). */
  bedDuckDb: number;
  /** How far cues drop under a voice, in dB (negative). Cues stay audible. */
  cueDuckDb: number;
  weatherDb: Record<WeatherState, number>;
}

export const DEFAULT_MIX: MixSettings = {
  crowdFloorDb: -24,
  crowdPeakDb: -6,
  cueDb: -8,
  bedDuckDb: -10,
  cueDuckDb: -4,
  weatherDb: { rain: -18, cloudy: -32, fair: -36, sunny: -40 },
};

export interface BusGains {
  master: number;
  crowd: number;
  weather: number;
  cues: number;
}

export function dbToGain(db: number): number {
  return db <= -100 ? 0 : 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

export function computeBusGains(state: MixState, settings: MixSettings = DEFAULT_MIX): BusGains {
  const excitement = clamp01(state.excitement);
  const crowdDb =
    settings.crowdFloorDb + (settings.crowdPeakDb - settings.crowdFloorDb) * excitement;
  const bedDuck = state.voiceActive ? settings.bedDuckDb : 0;
  const cueDuck = state.voiceActive ? settings.cueDuckDb : 0;
  return {
    master: state.muted ? 0 : clamp01(state.master),
    crowd: dbToGain(crowdDb + bedDuck),
    weather: state.weather ? dbToGain(settings.weatherDb[state.weather] + bedDuck) : 0,
    cues: dbToGain(settings.cueDb + cueDuck),
  };
}

/** Excitement after `elapsedSec` of exponential decay back towards `rest`. */
export function decayExcitement(
  level: number,
  elapsedSec: number,
  halfLifeSec = 6,
  rest = 0.15,
): number {
  if (elapsedSec <= 0) return clamp01(level);
  const k = 0.5 ** (elapsedSec / halfLifeSec);
  return clamp01(rest + (level - rest) * k);
}

/** Time constants for AudioParam.setTargetAtTime: duck fast, recover slowly. */
export const DUCK_ATTACK_SEC = 0.08;
export const DUCK_RELEASE_SEC = 0.6;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
