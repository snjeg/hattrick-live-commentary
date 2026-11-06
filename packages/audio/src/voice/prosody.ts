import { clampIntensity, type Mood, type Speaker } from '@hlc/core';

/** Engine-neutral delivery settings. Web Speech ranges: rate 0.1-10, pitch 0-2, volume 0-1. */
export interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

/** Mood at full intensity, as offsets from a neutral delivery. */
const MOOD_SHAPE: Record<Mood, Prosody> = {
  calm: { rate: -0.1, pitch: -0.05, volume: -0.15 },
  neutral: { rate: 0, pitch: 0, volume: 0 },
  anticipation: { rate: 0.12, pitch: 0.1, volume: 0.05 },
  excited: { rate: 0.3, pitch: 0.3, volume: 0.15 },
  celebratory: { rate: 0.25, pitch: 0.35, volume: 0.2 },
  tense: { rate: 0.15, pitch: 0.05, volume: 0.05 },
  disappointed: { rate: -0.15, pitch: -0.15, volume: -0.1 },
  concerned: { rate: -0.1, pitch: -0.1, volume: -0.1 },
};

/** The analyst speaks a little slower and lower than the play-by-play lead. */
const SPEAKER_BASE: Record<Speaker, Prosody> = {
  lead: { rate: 1.05, pitch: 1.05, volume: 0.85 },
  analyst: { rate: 0.95, pitch: 0.9, volume: 0.8 },
};

const LIMITS = {
  rate: [0.7, 1.5],
  pitch: [0.5, 1.6],
  volume: [0.3, 1],
} as const;

export function mapProsody(mood: Mood, intensity: number, speaker: Speaker): Prosody {
  const k = clampIntensity(intensity);
  const base = SPEAKER_BASE[speaker];
  const shape = MOOD_SHAPE[mood];
  return {
    rate: clamp(base.rate + shape.rate * k, LIMITS.rate),
    pitch: clamp(base.pitch + shape.pitch * k, LIMITS.pitch),
    volume: clamp(base.volume + shape.volume * k, LIMITS.volume),
  };
}

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000;
}
