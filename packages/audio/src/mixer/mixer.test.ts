import { describe, expect, it } from 'vitest';
import { computeBusGains, DEFAULT_MIX, dbToGain } from './gains';
import { createMixer, type AudioContextLike, type AudioParamLike } from './mixer';

/** Fake Web Audio context that records nodes and parameter automation. */
function fakeContext() {
  const log: string[] = [];
  let time = 0;
  const param = (name: string): AudioParamLike & { target?: number } => {
    const p: AudioParamLike & { target?: number } = {
      value: 0,
      setTargetAtTime: (target, at, tc) => {
        p.target = target;
        log.push(`${name}->${target.toFixed(3)}@${at}/${tc}`);
      },
      setValueAtTime: (v) => {
        p.value = v;
      },
      linearRampToValueAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
    };
    return p;
  };
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  let gains = 0;
  const started: string[] = [];
  const ctx: AudioContextLike & { advance(s: number): void; state: string } = {
    get currentTime() {
      return time;
    },
    sampleRate: 100,
    destination: node(),
    state: 'suspended',
    createGain: () => ({ ...node(), gain: param(`gain${gains++}`) }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param('f'), Q: param('q') }),
    createBuffer: (_c, length) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      start: () => started.push('buffer'),
      stop: () => undefined,
    }),
    createOscillator: () => ({
      ...node(),
      type: '',
      frequency: param('osc'),
      start: () => started.push('osc'),
      stop: () => undefined,
    }),
    resume: async () => {
      ctx.state = 'running';
    },
    close: async () => {
      ctx.state = 'closed';
    },
    advance(s) {
      time += s;
    },
  };
  return { ctx, log, started };
}

describe('mixer graph', () => {
  it('resumes the context and starts crowd and weather beds on start', async () => {
    const { ctx, started } = fakeContext();
    const mixer = createMixer(ctx, { random: () => 0.5 });
    await mixer.start();
    expect(ctx.state).toBe('running');
    expect(started.filter((s) => s === 'buffer')).toHaveLength(2);
  });

  it('plays generated cues only while running', async () => {
    const { ctx, started } = fakeContext();
    const mixer = createMixer(ctx);
    mixer.playCue('whistleFullTime');
    expect(started).toEqual([]);
    await mixer.start();
    mixer.playCue('whistleFullTime');
    expect(started.filter((s) => s === 'osc')).toHaveLength(3);
    mixer.playCue('roar');
    expect(started.at(-1)).toBe('buffer');
  });

  it('ducks fast under a voice and recovers slowly', async () => {
    const { ctx, log } = fakeContext();
    const mixer = createMixer(ctx);
    await mixer.start();
    log.length = 0;
    mixer.setVoiceActive(true);
    const crowdDown = log.find((l) => l.startsWith('gain1->'));
    const expected = computeBusGains({ ...mixer.state, voiceActive: true }).crowd;
    expect(crowdDown).toContain(`->${expected.toFixed(3)}@`);
    expect(expected).toBeCloseTo(dbToGain(-24 + 18 * 0.15 + DEFAULT_MIX.bedDuckDb), 5);
    expect(crowdDown).toMatch(/\/0\.08$/);
    log.length = 0;
    mixer.setVoiceActive(true); // no change, no automation
    expect(log).toEqual([]);
    mixer.setVoiceActive(false);
    expect(log.find((l) => l.startsWith('gain1->'))).toMatch(/\/0\.6$/);
  });

  it('swells the crowd on excite and decays it on tick', async () => {
    const { ctx } = fakeContext();
    const mixer = createMixer(ctx);
    await mixer.start();
    mixer.excite(1);
    expect(mixer.state.excitement).toBe(1);
    ctx.advance(6);
    mixer.tick();
    expect(mixer.state.excitement).toBeCloseTo(0.575, 2);
    mixer.excite(0.2); // never lowers a swell that is still higher
    expect(mixer.state.excitement).toBeCloseTo(0.575, 2);
  });

  it('sets weather, volume and mute', async () => {
    const { ctx } = fakeContext();
    const mixer = createMixer(ctx);
    mixer.setWeather('rain');
    expect(mixer.state.weather).toBe('rain');
    mixer.setWeather(undefined);
    expect(mixer.state.weather).toBeUndefined();
    mixer.setMasterVolume(2);
    expect(mixer.state.master).toBe(1);
    mixer.setMuted(true);
    expect(mixer.state.muted).toBe(true);
    await mixer.stop();
    expect(ctx.state).toBe('closed');
  });
});
