import { describe, expect, it } from 'vitest';
import { createFakeVoiceProvider } from './fake';
import type { Utterance } from './types';

const u = (text: string): Utterance => ({ text, speaker: 'lead', mood: 'neutral', intensity: 0.5 });

describe('fake voice provider', () => {
  it('records lines and finishes on demand', async () => {
    const fake = createFakeVoiceProvider();
    const p = fake.speak(u('one'));
    expect(fake.speaking?.text).toBe('one');
    fake.finish();
    expect(await p).toBe('done');
    expect(fake.speaking).toBeUndefined();
    expect(fake.spoken.map((s) => s.text)).toEqual(['one']);
  });

  it('interrupts the current line when a new one starts, on cancel and on abort', async () => {
    const fake = createFakeVoiceProvider();
    const a = fake.speak(u('a'));
    const b = fake.speak(u('b'));
    expect(await a).toBe('interrupted');
    fake.cancel();
    expect(await b).toBe('interrupted');
    const controller = new AbortController();
    const c = fake.speak(u('c'), controller.signal);
    controller.abort();
    expect(await c).toBe('interrupted');
  });

  it('can finish lines automatically and remembers pinned voices', async () => {
    const fake = createFakeVoiceProvider({ autoFinish: true });
    expect(await fake.speak(u('x'))).toBe('done');
    fake.setVoice('analyst', 'fake-analyst');
    expect(fake.pins).toEqual({ analyst: 'fake-analyst' });
    expect((await fake.voices()).every((v) => v.local)).toBe(true);
  });
});
