import { classifyEventType } from '@hlc/core';
import { describe, expect, it } from 'vitest';
import { crowdReaction } from './cues';

const ev = (typeId: number) => ({ typeId, ...classifyEventType(typeId) });

describe('crowd reactions', () => {
  it('roars for goals, gasps for misses and whistles for kick-off and the end', () => {
    expect(crowdReaction(ev(121))).toEqual({ cue: 'roar', excitement: 1 });
    expect(crowdReaction(ev(221)).cue).toBe('gasp');
    expect(crowdReaction(ev(598)).cue).toBe('whistleStart');
    expect(crowdReaction(ev(45)).cue).toBe('whistleHalfTime');
    expect(crowdReaction(ev(599)).cue).toBe('whistleFullTime');
  });

  it('whistles for yellow cards and boos red ones', () => {
    expect(crowdReaction(ev(510)).cue).toBe('whistleFoul');
    expect(crowdReaction(ev(512)).cue).toBe('boo');
    expect(crowdReaction(ev(514)).cue).toBe('boo');
  });

  it('roars or groans for each shoot-out kick', () => {
    expect(crowdReaction(ev(56)).cue).toBe('roar');
    expect(crowdReaction(ev(59)).cue).toBe('groan');
  });

  it('hushes for injuries and stays quiet for info events', () => {
    expect(crowdReaction(ev(401)).cue).toBe('hush');
    expect(crowdReaction(ev(811))).toEqual({});
    expect(crowdReaction(ev(999))).toEqual({});
  });
});
