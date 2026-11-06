import type { Mood, Speaker } from '@hlc/core';

export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
  /** On-device voice. The MVP uses only these, so no match text leaves the computer. */
  local: boolean;
}

/** One spoken line, carrying the expression the script asked for. */
export interface Utterance {
  text: string;
  speaker: Speaker;
  mood: Mood;
  /** 0..1 */
  intensity: number;
  /** BCP 47 language tag; providers default to English. */
  lang?: string;
}

export type SpeakOutcome = 'done' | 'interrupted' | 'failed';

/**
 * All speech goes through this interface. The on-device Web Speech adapter is only the default;
 * expressive voices replace it later without changing scripts.
 */
export interface VoiceProvider {
  readonly id: string;
  /** Voices this provider may use. */
  voices(): Promise<VoiceInfo[]>;
  /** Pins a voice to a speaker; otherwise the provider chooses. */
  setVoice(speaker: Speaker, voiceId: string): void;
  /** Resolves when the line ends, is interrupted (cancel or abort) or fails. Never rejects. */
  speak(utterance: Utterance, signal?: AbortSignal): Promise<SpeakOutcome>;
  /** Stops the current line immediately. */
  cancel(): void;
}
