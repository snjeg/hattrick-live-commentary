import { describe, expect, it, vi } from 'vitest';
import type { Utterance } from './types';
import {
  createWebSpeechProvider,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from './web-speech';

function voice(name: string, lang: string, localService = true): SpeechVoiceLike {
  return { voiceURI: `uri:${name}`, name, lang, localService };
}

/** Minimal mocked speechSynthesis: queues utterances; tests end them explicitly. */
function mockSynth(initialVoices: SpeechVoiceLike[]) {
  let voices = initialVoices;
  const listeners = new Set<() => void>();
  const queue: SpeechUtteranceLike[] = [];
  const synth: SpeechSynthesisLike & { spoken: SpeechUtteranceLike[] } = {
    spoken: [],
    getVoices: () => voices,
    speak: vi.fn((u: SpeechUtteranceLike) => {
      synth.spoken.push(u);
      queue.push(u);
    }),
    cancel: vi.fn(() => {
      for (const u of queue.splice(0)) u.onerror?.({ error: 'interrupted' });
    }),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
  };
  return {
    synth,
    end() {
      queue.shift()?.onend?.({});
    },
    fail(error: string) {
      queue.shift()?.onerror?.({ error });
    },
    loadVoices(next: SpeechVoiceLike[]) {
      voices = next;
      for (const l of [...listeners]) l();
    },
  };
}

function utteranceFactory() {
  return (text: string): SpeechUtteranceLike => ({
    text,
    lang: '',
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    onend: null,
    onerror: null,
  });
}

const line = (over: Partial<Utterance> = {}): Utterance => ({
  text: 'GOAL!',
  speaker: 'lead',
  mood: 'excited',
  intensity: 1,
  ...over,
});

/** Lets the provider's internal `await` settle before driving the mock. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Web Speech adapter', () => {
  it('lists only local voices', async () => {
    const m = mockSynth([
      voice('Daniel', 'en-GB'),
      voice('Cloud', 'en-US', false),
      voice('Anna', 'de-DE'),
    ]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    expect((await p.voices()).map((v) => v.name)).toEqual(['Daniel', 'Anna']);
  });

  it('waits for the browser to load voices', async () => {
    const m = mockSynth([]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    const pending = p.voices();
    m.loadVoices([voice('Daniel', 'en-GB')]);
    expect((await pending).map((v) => v.name)).toEqual(['Daniel']);
  });

  it('gives lead and analyst different local voices in the preferred language', async () => {
    const m = mockSynth([voice('Anna', 'de-DE'), voice('Daniel', 'en-GB'), voice('Kate', 'en-GB')]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    const a = p.speak(line({ speaker: 'lead' }));
    await tick();
    m.end();
    await a;
    const b = p.speak(line({ speaker: 'analyst', mood: 'calm', intensity: 0.5 }));
    await tick();
    m.end();
    await b;
    expect(m.synth.spoken.map((u) => u.voice?.name)).toEqual(['Daniel', 'Kate']);
  });

  it('applies mood and intensity as rate, pitch and volume', async () => {
    const m = mockSynth([voice('Daniel', 'en-GB'), voice('Kate', 'en-GB')]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    void p.speak(line({ mood: 'excited', intensity: 1 }));
    await tick();
    m.end();
    void p.speak(line({ mood: 'excited', intensity: 0 }));
    await tick();
    const [hot, flat] = m.synth.spoken;
    expect(hot?.rate).toBeGreaterThan(flat?.rate ?? Infinity);
    expect(hot?.pitch).toBeGreaterThan(flat?.pitch ?? Infinity);
    expect(hot?.lang).toBe('en-GB');
  });

  it('splits one shared voice by pitch when only one local voice exists', async () => {
    const m = mockSynth([voice('Daniel', 'en-GB')]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    void p.speak(line({ speaker: 'lead', mood: 'neutral' }));
    await tick();
    m.end();
    void p.speak(line({ speaker: 'analyst', mood: 'neutral' }));
    await tick();
    const [lead, analyst] = m.synth.spoken;
    expect(analyst?.voice).toBe(lead?.voice);
    expect(analyst?.pitch).toBeLessThan(lead?.pitch ?? 0);
  });

  it('honours pinned voices', async () => {
    const m = mockSynth([
      voice('Daniel', 'en-GB'),
      voice('Kate', 'en-GB'),
      voice('Serena', 'en-GB'),
    ]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });
    p.setVoice('analyst', 'uri:Serena');
    void p.speak(line({ speaker: 'analyst' }));
    await tick();
    expect(m.synth.spoken[0]?.voice?.name).toBe('Serena');
  });

  it('never falls back to a network voice', async () => {
    const m = mockSynth([voice('Cloud', 'en-US', false)]);
    const p = createWebSpeechProvider({
      synth: m.synth,
      createUtterance: utteranceFactory(),
      voicesTimeoutMs: 1,
    });
    expect(await p.speak(line())).toBe('failed');
    expect(m.synth.speak).not.toHaveBeenCalled();
  });

  it('reports done, failed and interrupted outcomes', async () => {
    const m = mockSynth([voice('Daniel', 'en-GB')]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });

    const done = p.speak(line());
    await tick();
    m.end();
    expect(await done).toBe('done');

    const failed = p.speak(line());
    await tick();
    m.fail('synthesis-failed');
    expect(await failed).toBe('failed');

    const cancelled = p.speak(line());
    await tick();
    p.cancel();
    expect(await cancelled).toBe('interrupted');
  });

  it('interrupts on abort signal and when a new line starts', async () => {
    const m = mockSynth([voice('Daniel', 'en-GB')]);
    const p = createWebSpeechProvider({ synth: m.synth, createUtterance: utteranceFactory() });

    const controller = new AbortController();
    const aborted = p.speak(line({ speaker: 'analyst' }), controller.signal);
    await tick();
    controller.abort();
    expect(await aborted).toBe('interrupted');

    const first = p.speak(line({ speaker: 'analyst' }));
    await tick();
    const second = p.speak(line({ speaker: 'lead' }));
    expect(await first).toBe('interrupted');
    await tick();
    m.end();
    expect(await second).toBe('done');

    expect(await p.speak(line(), AbortSignal.abort())).toBe('interrupted');
  });

  it('fails clearly where Web Speech does not exist', () => {
    expect(() => createWebSpeechProvider()).toThrow(/not available/);
  });
});
