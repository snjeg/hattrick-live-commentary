import type { WeatherState } from '@hlc/core';
import type { CueId } from './cues';
import {
  clamp01,
  computeBusGains,
  decayExcitement,
  DEFAULT_MIX,
  DUCK_ATTACK_SEC,
  DUCK_RELEASE_SEC,
  type MixSettings,
  type MixState,
} from './gains';

/**
 * Web Audio graph: master <- { crowd bed, weather bed, cues }. Placeholder sources are generated
 * (filtered noise and tones), so no sound files are needed yet. The context is injected; in the
 * extension it must be created or resumed after a user click (MV3 rule 7).
 */

// Minimal structural types for the parts of Web Audio we use, so tests can pass a fake context.
export interface AudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  cancelScheduledValues(startTime: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}
export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}
export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}
export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface ScheduledSourceLike extends AudioNodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}
export interface AudioBufferSourceNodeLike extends ScheduledSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
}
export interface OscillatorNodeLike extends ScheduledSourceLike {
  type: string;
  frequency: AudioParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  readonly state: string;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createOscillator(): OscillatorNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface Mixer {
  /** Starts the beds. Call from a user gesture. */
  start(): Promise<void>;
  stop(): Promise<void>;
  setWeather(weather: WeatherState | undefined): void;
  /** Swell the crowd (0..1); it decays back on its own. */
  excite(level: number): void;
  playCue(cue: CueId): void;
  /** Duck beds and cues while a commentator speaks. */
  setVoiceActive(active: boolean): void;
  setMasterVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Advance time-based behaviour (crowd decay). Call from a timer, e.g. every 250 ms. */
  tick(): void;
  readonly state: Readonly<MixState>;
}

export interface MixerOptions {
  settings?: MixSettings;
  /** Seeded random source for noise, so tests are deterministic. */
  random?: () => number;
}

export function createMixer(ctx: AudioContextLike, options: MixerOptions = {}): Mixer {
  const settings = options.settings ?? DEFAULT_MIX;
  const random = options.random ?? Math.random;
  const state: MixState = { master: 0.8, muted: false, excitement: 0.15, voiceActive: false };
  let excitedAt = ctx.currentTime;
  let peak = state.excitement;
  let running = false;
  const beds: ScheduledSourceLike[] = [];

  const master = ctx.createGain();
  const crowd = ctx.createGain();
  const weather = ctx.createGain();
  const cues = ctx.createGain();
  master.connect(ctx.destination);
  crowd.connect(master);
  weather.connect(master);
  cues.connect(master);

  const noise = makeNoise(ctx, 2, random);

  function apply(timeConstant: number): void {
    const g = computeBusGains(state, settings);
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(g.master, now, 0.05);
    crowd.gain.setTargetAtTime(g.crowd, now, timeConstant);
    weather.gain.setTargetAtTime(g.weather, now, timeConstant);
    cues.gain.setTargetAtTime(g.cues, now, timeConstant);
  }

  function bed(filterType: string, frequency: number, q: number, out: GainNodeLike): void {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    src.connect(filter);
    filter.connect(out);
    src.start();
    beds.push(src);
  }

  function tone(
    type: string,
    freq: number,
    at: number,
    length: number,
    peakGain: number,
    glideTo?: number,
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo !== undefined) osc.frequency.linearRampToValueAtTime(glideTo, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peakGain, at + 0.02);
    env.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(env);
    env.connect(cues);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  function burst(
    filterType: string,
    frequency: number,
    at: number,
    length: number,
    peakGain: number,
  ) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peakGain, at + length * 0.25);
    env.gain.linearRampToValueAtTime(0, at + length);
    src.connect(filter);
    filter.connect(env);
    env.connect(cues);
    src.start(at);
    src.stop(at + length + 0.05);
  }

  const CUE_RENDER: Record<CueId, (t: number) => void> = {
    whistleStart: (t) => tone('sine', 3000, t, 0.6, 0.6),
    whistleFoul: (t) => tone('sine', 3200, t, 0.35, 0.6),
    whistleHalfTime: (t) => {
      tone('sine', 3000, t, 0.3, 0.6);
      tone('sine', 3000, t + 0.45, 0.6, 0.6);
    },
    whistleFullTime: (t) => {
      tone('sine', 3000, t, 0.3, 0.6);
      tone('sine', 3000, t + 0.45, 0.3, 0.6);
      tone('sine', 3000, t + 0.9, 1, 0.6);
    },
    roar: (t) => burst('bandpass', 900, t, 3.5, 1),
    cheer: (t) => burst('bandpass', 1200, t, 2, 0.7),
    applause: (t) => burst('highpass', 2500, t, 2.5, 0.5),
    gasp: (t) => burst('bandpass', 700, t, 1.2, 0.8),
    groan: (t) => tone('sawtooth', 220, t, 1.4, 0.25, 140),
    boo: (t) => tone('sawtooth', 150, t, 1.8, 0.3, 120),
    hush: (t) => burst('lowpass', 400, t, 1.5, 0.3),
  };

  apply(0.05);

  return {
    state,
    async start() {
      if (running) return;
      if (ctx.state !== 'running') await ctx.resume();
      bed('bandpass', 800, 0.5, crowd); // crowd murmur
      bed('highpass', 4000, 0.3, weather); // rain/wind texture, level set by weather
      running = true;
      apply(0.3);
    },
    async stop() {
      for (const b of beds.splice(0)) b.stop();
      running = false;
      await ctx.close();
    },
    setWeather(w) {
      if (w) state.weather = w;
      else delete state.weather;
      apply(1.5);
    },
    excite(level) {
      peak = Math.max(clamp01(level), currentExcitement());
      excitedAt = ctx.currentTime;
      state.excitement = peak;
      apply(0.15);
    },
    playCue(cue) {
      if (!running) return;
      CUE_RENDER[cue](ctx.currentTime + 0.01);
    },
    setVoiceActive(active) {
      if (state.voiceActive === active) return;
      state.voiceActive = active;
      apply(active ? DUCK_ATTACK_SEC : DUCK_RELEASE_SEC);
    },
    setMasterVolume(volume) {
      state.master = clamp01(volume);
      apply(0.05);
    },
    setMuted(muted) {
      state.muted = muted;
      apply(0.05);
    },
    tick() {
      const next = currentExcitement();
      if (Math.abs(next - state.excitement) < 0.005) return;
      state.excitement = next;
      apply(0.5);
    },
  };

  function currentExcitement(): number {
    return decayExcitement(peak, ctx.currentTime - excitedAt);
  }
}

function makeNoise(ctx: AudioContextLike, seconds: number, random: () => number): AudioBufferLike {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = random() * 2 - 1;
  return buffer;
}
