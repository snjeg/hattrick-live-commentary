import { SPEAKERS, type Speaker } from '@hlc/core';
import { mapProsody } from './prosody';
import type { SpeakOutcome, Utterance, VoiceInfo, VoiceProvider } from './types';

/**
 * Default on-device voice: the browser's Web Speech API, restricted to local voices so no match
 * text goes to a network voice service. This is the only module allowed to touch Web Speech.
 */

/** The parts of `SpeechSynthesisVoice` we use. */
export interface SpeechVoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

/** The parts of `SpeechSynthesisUtterance` we use. */
export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  voice: SpeechVoiceLike | null;
  rate: number;
  pitch: number;
  volume: number;
  onend: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

/** The parts of `speechSynthesis` we use. */
export interface SpeechSynthesisLike {
  getVoices(): SpeechVoiceLike[];
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
}

export interface WebSpeechOptions {
  /** Defaults to `globalThis.speechSynthesis`. */
  synth?: SpeechSynthesisLike;
  /** Defaults to `new SpeechSynthesisUtterance(text)`. */
  createUtterance?: (text: string) => SpeechUtteranceLike;
  /** Preferred language prefix for automatic voice choice. */
  lang?: string;
  /** How long to wait for the browser to load its voice list. */
  voicesTimeoutMs?: number;
}

/** Pitch offset used when both speakers must share one voice. */
const SHARED_VOICE_PITCH_SPLIT = 0.15;

export function createWebSpeechProvider(options: WebSpeechOptions = {}): VoiceProvider {
  const synth = options.synth ?? defaultSynth();
  const createUtterance = options.createUtterance ?? defaultUtterance;
  const lang = options.lang ?? 'en';
  const timeoutMs = options.voicesTimeoutMs ?? 1500;
  const pinned: Partial<Record<Speaker, string>> = {};
  let current: { finish: (outcome: SpeakOutcome) => void } | undefined;

  async function localVoices(): Promise<SpeechVoiceLike[]> {
    let list = synth.getVoices();
    if (list.length === 0) {
      list = await new Promise<SpeechVoiceLike[]>((resolve) => {
        const done = () => {
          synth.removeEventListener('voiceschanged', done);
          clearTimeout(timer);
          resolve(synth.getVoices());
        };
        const timer = setTimeout(done, timeoutMs);
        synth.addEventListener('voiceschanged', done);
      });
    }
    return list.filter((v) => v.localService);
  }

  /** Lead gets the first matching local voice, the analyst a different one when available. */
  function assign(voices: SpeechVoiceLike[]): Record<Speaker, SpeechVoiceLike | undefined> {
    const preferred = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    const pool = preferred.length > 0 ? preferred : voices;
    const byId = (id: string | undefined) => voices.find((v) => v.voiceURI === id);
    const lead = byId(pinned.lead) ?? pool[0];
    const analyst = byId(pinned.analyst) ?? pool.find((v) => v !== lead) ?? lead;
    return { lead, analyst };
  }

  return {
    id: 'web-speech',

    async voices(): Promise<VoiceInfo[]> {
      return (await localVoices()).map((v) => ({
        id: v.voiceURI,
        name: v.name,
        lang: v.lang,
        local: true,
      }));
    },

    setVoice(speaker, voiceId) {
      if (SPEAKERS.includes(speaker)) pinned[speaker] = voiceId;
    },

    async speak(utterance: Utterance, signal?: AbortSignal): Promise<SpeakOutcome> {
      if (signal?.aborted) return 'interrupted';
      const voices = await localVoices();
      const assigned = assign(voices);
      const voice = assigned[utterance.speaker];
      // No local voice: stay silent rather than fall back to a network voice.
      if (!voice) return 'failed';

      const prosody = mapProsody(utterance.mood, utterance.intensity, utterance.speaker);
      const shared = assigned.lead === assigned.analyst;
      const u = createUtterance(utterance.text);
      u.voice = voice;
      u.lang = utterance.lang ?? voice.lang;
      u.rate = prosody.rate;
      u.pitch =
        shared && utterance.speaker === 'analyst'
          ? Math.max(0.5, prosody.pitch - SHARED_VOICE_PITCH_SPLIT)
          : prosody.pitch;
      u.volume = prosody.volume;

      // One voice at a time: a new line replaces whatever is still speaking.
      if (current) {
        current.finish('interrupted');
        synth.cancel();
      }

      return new Promise<SpeakOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: SpeakOutcome) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          if (current?.finish === finish) current = undefined;
          resolve(outcome);
        };
        const onAbort = () => {
          finish('interrupted');
          synth.cancel();
        };
        u.onend = () => finish('done');
        u.onerror = (event) =>
          finish(
            event.error === 'interrupted' || event.error === 'canceled' ? 'interrupted' : 'failed',
          );
        signal?.addEventListener('abort', onAbort);
        current = { finish };
        synth.speak(u);
      });
    },

    cancel() {
      current?.finish('interrupted');
      synth.cancel();
    },
  };
}

function defaultSynth(): SpeechSynthesisLike {
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesisLike }).speechSynthesis;
  if (!synth) throw new Error('Web Speech is not available in this context');
  return synth;
}

function defaultUtterance(text: string): SpeechUtteranceLike {
  const Ctor = (
    globalThis as { SpeechSynthesisUtterance?: new (text: string) => SpeechUtteranceLike }
  ).SpeechSynthesisUtterance;
  if (!Ctor) throw new Error('SpeechSynthesisUtterance is not available in this context');
  return new Ctor(text);
}
