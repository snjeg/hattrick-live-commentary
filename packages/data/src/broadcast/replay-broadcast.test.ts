// End to end: a saved match replayed through the script engine prints a full broadcast with no
// silence over the limit, no immediate repeats and correct turn-taking (Sprint 2 exit check).
import {
  createMatchClock,
  createScheduler,
  createTalkingPoints,
  createTemplateWriter,
  factsFromEvent,
  factsFromHeader,
  formatScript,
  runningScore,
  seededRandom,
  simulate,
  type Line,
  type Match,
  type MatchEvent,
} from '@hlc/core';
import { describe, expect, it } from 'vitest';
import realXml from '../../../../fixtures/real/live-viewall-livetexts.xml?raw';
import { parseLive } from '../chpp/live';
import { createReplaySource } from '../replay/replay-source';

const START = 0;
const MIN = 60_000;
const SILENCE_LIMIT = 20_000;

async function timeline(match: Match): Promise<{ at: number; event: MatchEvent }[]> {
  const source = createReplaySource(match, { startAt: START, speed: 1 });
  const out: { at: number; event: MatchEvent }[] = [];
  let now = START;
  for (;;) {
    const update = await source.poll(now);
    for (const event of update.events) out.push({ at: now, event });
    if (update.finished || update.nextPollAt === undefined) return out;
    now = update.nextPollAt;
  }
}

async function broadcast(match: Match) {
  const header = await createReplaySource(match, { startAt: START }).open();
  const due = await timeline(match);
  const end = (due.at(-1)?.at ?? START) + MIN;
  const clock = createMatchClock({ kickoffAt: START + 3 * MIN });
  const writer = createTemplateWriter({ random: seededRandom(1) });
  const points = createTalkingPoints({ random: seededRandom(2) });
  points.add(factsFromHeader(header));
  const released: MatchEvent[] = [];
  const scheduler = createScheduler({
    silenceLimitMs: SILENCE_LIMIT,
    filler: (now, mustSpeak) => {
      const situation = {
        now,
        minute: clock.at(now).minute,
        score: runningScore(released),
        home: header.home,
        away: header.away,
      };
      return mustSpeak ? points.next(situation) : points.fresh(situation);
    },
  });
  const result = simulate({
    scheduler,
    from: START,
    to: end,
    arrivals: (now) => {
      const lines: Line[] = [];
      while (due[0] && due[0].at <= now) {
        const { event } = due.shift() as { at: number; event: MatchEvent };
        released.push(event);
        clock.observe(event.minute, event.part, now);
        points.add(factsFromEvent(event), now);
        lines.push(
          ...writer.linesForEvent({
            event,
            home: header.home,
            away: header.away,
            score: runningScore(released),
            now,
          }),
        );
      }
      return lines;
    },
  });
  return { result, script: formatScript(result.transcript, START) };
}

describe('replayed broadcast (real fixture)', () => {
  const [, cacio] = parseLive(realXml, { logUnknownKey: () => undefined }).matches as [
    Match,
    Match,
  ];

  it('prints a full match script with no silence over the limit and one voice at a time', async () => {
    const { result, script } = await broadcast(cacio);
    expect(result.longestSilenceMs).toBeLessThanOrEqual(SILENCE_LIMIT);
    expect(result.overlaps).toBe(0);
    expect(script).toContain('LEAD (anticipation): The teams are in position');
    expect(script).toContain('The final result is 1 - 4.');
    const texts = result.transcript.map((s) => s.line.text);
    for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
    // Goals are called in full by the lead.
    const goalBeats = result.transcript.filter(
      (s) => s.line.text.includes('GOAL') || s.line.text.includes('Goal'),
    );
    expect(goalBeats.length).toBeGreaterThan(0);
    expect(goalBeats.every((s) => s.line.speaker === 'lead')).toBe(true);
    // Never reveal the poll hint.
    expect(script).not.toMatch(/NextEvent/i);
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    if (env?.['PRINT_SCRIPT']) console.log(script);
    // Fillers vary: no filler text comes back within five minutes.
    const lastSaid = new Map<string, number>();
    for (const s of result.transcript.filter((x) => x.line.factId)) {
      const before = lastSaid.get(s.line.text);
      if (before !== undefined)
        expect(s.start - before, s.line.text).toBeGreaterThanOrEqual(5 * MIN);
      lastSaid.set(s.line.text, s.start);
    }
  });
});
