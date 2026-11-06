import { describe, expect, it } from 'vitest';
import { classifyEventType } from '../model/event-types';
import type { Beat, MatchEvent, Side, Team } from '../model/types';
import { MOODS } from '../model/voice';
import { fillTemplate, ordinal } from './fill';
import { createVariantPicker } from './picker';
import { seededRandom } from './rng';
import { createTemplateWriter, PRIORITY } from './template-writer';
import { TEMPLATES, templatesFor, type Topic } from './templates';

const home: Team = {
  id: 3010,
  name: 'Canada',
  shortName: 'Canada',
  lineup: [{ id: 3497216, name: 'Neil Pemberton', roleId: 111 }],
};
const away: Team = { id: 3025, name: 'Nederland', shortName: 'Nederland', lineup: [] };
const NOW = 1_000_000;

function event(
  typeId: number,
  opts: { side?: Side; beats?: Beat[]; minute?: number; subject?: number } = {},
): MatchEvent {
  return {
    index: typeId,
    minute: opts.minute ?? 36,
    part: 1,
    key: `${typeId}_1`,
    typeId,
    variant: 1,
    ...classifyEventType(typeId),
    beats: opts.beats ?? [],
    ...(opts.side ? { side: opts.side } : {}),
    ...(opts.subject ? { subjectPlayerId: opts.subject } : {}),
  };
}

const writer = (seed = 1) => createTemplateWriter({ random: seededRandom(seed) });

describe('templates', () => {
  const covered: Topic[] = [
    'kickoff',
    'halfTime',
    'fullTime',
    'goal',
    'miss',
    'card.yellow',
    'card.red',
    'injury',
  ];

  it('have at least 3 variants per role for every covered event type', () => {
    for (const topic of covered) {
      expect(templatesFor(topic, 'lead').length, `${topic} lead`).toBeGreaterThanOrEqual(3);
      expect(templatesFor(topic, 'analyst').length, `${topic} analyst`).toBeGreaterThanOrEqual(3);
    }
    for (const topic of [
      'goal.reducing',
      'goal.equalizer',
      'goal.lead',
      'goal.increase',
    ] as const) {
      expect(templatesFor(topic, 'lead').length, topic).toBeGreaterThanOrEqual(3);
    }
  });

  it('use known placeholders, valid moods and intensities, and unique ids', () => {
    const known = new Set([
      'team',
      'opponent',
      'player',
      'scoreline',
      'minute',
      'situation',
      'homeTeam',
      'awayTeam',
    ]);
    for (const t of TEMPLATES) {
      for (const [, name] of t.text.matchAll(/\{(\w+)\}/g))
        expect(known.has(name ?? ''), `${t.id}: ${name}`).toBe(true);
      expect(MOODS).toContain(t.mood);
      expect(t.intensity).toBeGreaterThanOrEqual(0);
      expect(t.intensity).toBeLessThanOrEqual(1);
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('keep lines short enough to interrupt', () => {
    for (const t of TEMPLATES) expect(t.text.length, t.id).toBeLessThanOrEqual(100);
  });
});

describe('template writer', () => {
  it('speaks Hattrick beats as the lead, building to an uninterruptible goal call', () => {
    const beats: Beat[] = [
      { text: 'An interesting bit of build-up play beginning here...', mentions: [] },
      {
        text: 'Neil Pemberton looks like he is trying to find an opening...',
        mentions: [{ kind: 'player', name: 'Neil Pemberton', side: 'home', playerId: 3497216 }],
      },
      {
        text: 'GOAL! 1 - 0 to Canada.',
        mentions: [{ kind: 'team', name: 'Canada', side: 'home' }],
      },
    ];
    const lines = writer().linesForEvent({
      event: event(121, { side: 'home', beats, subject: 3497216 }),
      home,
      away,
      score: { home: 1, away: 0 },
      now: NOW,
    });
    const lead = lines.filter((l) => l.speaker === 'lead');
    expect(lead.map((l) => l.text)).toEqual(beats.map((b) => b.text));
    expect(lead.map((l) => l.mood)).toEqual(['anticipation', 'anticipation', 'excited']);
    expect(lead.at(-1)).toMatchObject({
      interruptible: false,
      priority: PRIORITY.goal,
      intensity: 1,
    });
    expect(lead[0]?.intensity).toBeLessThan(lead[1]?.intensity ?? 0);
    const analyst = lines.filter((l) => l.speaker === 'analyst');
    expect(analyst).toHaveLength(1);
    expect(analyst[0]).toMatchObject({ interruptible: true, priority: PRIORITY.analystReaction });
    expect(analyst[0]?.text).not.toMatch(/[{}]/);
    expect(lines.every((l) => l.expiresAt > NOW && l.eventIndex === 121)).toBe(true);
  });

  it('writes a templated call with the score context when there is no text (report mode)', () => {
    const lines = writer().linesForEvent({
      event: event(121, { side: 'home', subject: 3497216 }),
      home,
      away,
      score: { home: 1, away: 0 },
      now: NOW,
    });
    expect(lines[0]?.speaker).toBe('lead');
    expect(lines[0]?.templateId).toMatch(/^goal\.lead\.lead\./);
    expect(lines[0]?.text).toContain('Canada 1, Nederland 0');
    expect(lines[1]?.speaker).toBe('analyst');
  });

  it('degrades gracefully when the player is unknown', () => {
    const w = writer(3);
    for (let i = 0; i < 6; i++) {
      const lines = w.linesForEvent({
        event: event(510, { side: 'away' }),
        home,
        away,
        score: { home: 0, away: 0 },
        now: NOW + i,
      });
      // Every card template names the player except one analyst line; the lead has nothing to say.
      expect(lines.every((l) => !l.text.includes('{'))).toBe(true);
      expect(lines.filter((l) => l.speaker === 'lead')).toHaveLength(0);
    }
  });

  it('never repeats a variant while others are available', () => {
    const w = writer(7);
    const used: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [call] = w.linesForEvent({
        event: event(221, { side: 'home', subject: 3497216 }),
        home,
        away,
        score: { home: 0, away: 0 },
        now: NOW + i * 60_000,
      });
      used.push(call?.templateId ?? '');
    }
    expect(new Set(used).size).toBe(3);
  });

  it('hands context events to the analyst at low priority', () => {
    const lines = writer().linesForEvent({
      event: event(811, {
        beats: [{ text: 'The last time these teams met it was a draw.', mentions: [] }],
      }),
      home,
      away,
      score: { home: 0, away: 0 },
      now: NOW,
    });
    expect(lines).toEqual([
      expect.objectContaining({
        speaker: 'analyst',
        priority: PRIORITY.analystContext,
        interruptible: true,
      }),
    ]);
  });

  it('calls kick-off and full time from templates', () => {
    const w = writer();
    const kickoff = w.linesForEvent({
      event: event(598, { minute: 0 }),
      home,
      away,
      score: { home: 0, away: 0 },
      now: NOW,
    });
    expect(kickoff.map((l) => l.speaker)).toEqual(['lead', 'analyst']);
    const end = w.linesForEvent({
      event: event(599, { minute: 92 }),
      home,
      away,
      score: { home: 1, away: 4 },
      now: NOW,
    });
    expect(end[0]?.text).toContain('Canada 1, Nederland 4');
  });
});

describe('helpers', () => {
  it('fills placeholders or reports a gap', () => {
    expect(fillTemplate('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
    expect(fillTemplate('{a} and {b}', { a: 'x' })).toBeUndefined();
    expect(fillTemplate('{a}', { a: '' })).toBeUndefined();
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 92, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '92nd',
      '111th',
    ]);
  });

  it('picks the least recently used variant when all are cooling down', () => {
    const picker = createVariantPicker({ cooldownMs: 1000, random: () => 0 });
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(picker.pick(items, 0)?.id).toBe('a');
    expect(picker.pick(items, 1)?.id).toBe('b');
    expect(picker.pick(items, 2)?.id).toBe('a');
    expect(picker.pick([], 3)).toBeUndefined();
  });

  it('is reproducible with a seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
