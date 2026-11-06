import type { Speaker } from '@hlc/core';
import type { SpeakOutcome, Utterance, VoiceInfo, VoiceProvider } from './types';

/**
 * Test double for `VoiceProvider`. Records every line; each line stays "speaking" until the test
 * calls `finish()`, or finishes on its own when `autoFinish` is set.
 */
export interface FakeVoiceProvider extends VoiceProvider {
  readonly spoken: Utterance[];
  readonly speaking: Utterance | undefined;
  readonly pins: Partial<Record<Speaker, string>>;
  /** Ends the current line with the given outcome (default `done`). */
  finish(outcome?: SpeakOutcome): void;
}

export function createFakeVoiceProvider(options: { autoFinish?: boolean } = {}): FakeVoiceProvider {
  const spoken: Utterance[] = [];
  const pins: Partial<Record<Speaker, string>> = {};
  let current: { utterance: Utterance; resolve: (o: SpeakOutcome) => void } | undefined;

  const end = (outcome: SpeakOutcome) => {
    const c = current;
    current = undefined;
    c?.resolve(outcome);
  };

  return {
    id: 'fake',
    spoken,
    pins,
    get speaking() {
      return current?.utterance;
    },
    voices(): Promise<VoiceInfo[]> {
      return Promise.resolve([
        { id: 'fake-lead', name: 'Fake Lead', lang: 'en-GB', local: true },
        { id: 'fake-analyst', name: 'Fake Analyst', lang: 'en-GB', local: true },
      ]);
    },
    setVoice(speaker, voiceId) {
      pins[speaker] = voiceId;
    },
    speak(utterance, signal) {
      if (signal?.aborted) return Promise.resolve('interrupted');
      end('interrupted');
      spoken.push(utterance);
      if (options.autoFinish) return Promise.resolve('done');
      return new Promise<SpeakOutcome>((resolve) => {
        current = { utterance, resolve };
        signal?.addEventListener('abort', () => {
          if (current?.utterance === utterance) end('interrupted');
        });
      });
    },
    cancel() {
      end('interrupted');
    },
    finish(outcome = 'done') {
      end(outcome);
    },
  };
}
