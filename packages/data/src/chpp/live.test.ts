import { runningScore, shootoutScore, type Match, type MatchEvent } from '@hlc/core';
import { describe, expect, it, vi } from 'vitest';
import realXml from '../../../../fixtures/real/live-viewall-livetexts.xml?raw';
import reportXml from '../../../../fixtures/samples/live-viewall-reporttexts.synthetic.xml?raw';
import inProgressXml from '../../../../fixtures/samples/live-viewnew-inprogress.synthetic.xml?raw';
import { parseLive, type UnknownEventKey } from './live';

const realLog: UnknownEventKey[] = [];
const real = parseLive(realXml, { logUnknownKey: (e) => realLog.push(e) });
const [canada, cacio] = real.matches as [Match, Match];

function byKey(match: Match, key: string, nth = 0): MatchEvent {
  const found = match.events.filter((e) => e.key === key)[nth];
  if (!found) throw new Error(`no event ${key}`);
  return found;
}

describe('live 2.3, live-texts mode (real fixture)', () => {
  it('classifies every event as goal, chance, card, info or context', () => {
    const cat = (m: Match, key: string) => byKey(m, key).category;
    expect(cat(canada, '121_1')).toBe('goal');
    expect(cat(canada, '162_2')).toBe('goal');
    expect(cat(canada, '219_1')).toBe('chance');
    expect(cat(canada, '273_1')).toBe('chance');
    expect(cat(canada, '510_2')).toBe('card');
    expect(cat(cacio, '511_2')).toBe('card');
    expect(cat(canada, '56_2')).toBe('goal'); // shoot-out kick scored
    expect(cat(canada, '58_3')).toBe('chance'); // shoot-out kick missed
    expect(cat(canada, '45_1')).toBe('info');
    expect(cat(cacio, '401_2')).toBe('info');
    expect(cat(cacio, '75_4')).toBe('info');
    expect(cat(cacio, '25_5')).toBe('context');
    expect(cat(cacio, '811_3')).toBe('context');
    expect(cat(cacio, '804_3')).toBe('context');
    expect(cat(cacio, '32_2')).toBe('context');
    expect(cat(cacio, '703_2')).toBe('context');
  });

  it('knows every real key except the undocumented 550, which it logs instead of failing', () => {
    const unknown = real.matches.flatMap((m) => m.events).filter((e) => !e.known);
    expect(unknown.map((e) => e.key)).toEqual(['550_2', '550_1']);
    expect(real.unknownKeys).toEqual([
      {
        typeId: 550,
        keys: ['550_2', '550_1'],
        count: 2,
        matchId: 767604296,
        index: 32,
        sampleText: '',
      },
    ]);
    expect(realLog).toEqual(real.unknownKeys);
  });

  it('reads the response header and both matches', () => {
    expect(real.version).toBe('2.3');
    expect(real.fetchedDate).toBe('2026-11-06T15:15:28');
    expect(real.matches.map((m) => m.matchId)).toEqual([9213692, 767604296]);
    expect(real.warnings).toEqual([]);
    expect(canada.matchDate).toBe('2003-07-18T20:00:00');
    expect(canada.matchType).toBe(11);
  });

  it('reads teams and starting lineups, keeping the set-piece taker apart', () => {
    expect(canada.home).toMatchObject({
      id: 3010,
      name: 'Canada',
      shortName: 'Canada',
      setPieceTakerId: 2742397,
    });
    expect(canada.away.name).toBe('Nederland');
    expect(canada.home.lineup).toHaveLength(11);
    expect(canada.home.lineup.every((p) => p.roleId !== 18)).toBe(true);
    expect(canada.home.lineup[0]).toEqual({
      id: 3792497,
      name: 'Jamie Tourrette',
      roleId: 100,
      behaviour: 0,
    });
  });

  it('reads every event, including index 0 and gaps', () => {
    expect(canada.events).toHaveLength(35);
    expect(canada.events[0]?.index).toBe(1);
    expect(cacio.events).toHaveLength(34);
    expect(cacio.events[0]?.index).toBe(0);
    expect(cacio.lastShownEventIndex).toBe(33);
  });

  it('accepts negative pre-match minutes', () => {
    const pre = cacio.events.filter((e) => e.minute < 0);
    expect(pre.map((e) => e.minute)).toEqual([-3, -2, -2, -2, -2, -1, -1]);
    expect(pre.every((e) => e.part === 0)).toBe(true);
    expect(byKey(cacio, '703_2')).toMatchObject({ minute: -3, group: 'managerQuote' });
  });

  it('splits event text on <br/> into beats, one per dramatic line', () => {
    const goal = byKey(canada, '121_1');
    expect(goal.beats.map((b) => b.text)).toEqual([
      'An interesting bit of build-up play beginning here...',
      'Some fans are rising from their seats in expectation...',
      'Neil Pemberton looks like he is trying to find an opening...',
      "He's gone for a speculative chip - the goalkeeper is scrambling back...",
      "GOAL! The keeper's hand stretched out desperately but couldn't stop it beating him to make the score 1 - 0 to Canada.",
    ]);
    expect(goal.beats[2]?.mentions).toEqual([
      { kind: 'player', name: 'Neil Pemberton', side: 'home', playerId: 3497216 },
    ]);
    expect(goal.beats[4]?.mentions).toEqual([{ kind: 'team', name: 'Canada', side: 'home' }]);
  });

  it('drops empty beats from repeated and lone <br /> tags', () => {
    expect(byKey(canada, '33_2').beats).toEqual([]);
    const lineup = byKey(canada, '21_1');
    expect(lineup.beats).toHaveLength(3);
    expect(lineup.beats.every((b) => b.text.length > 0)).toBe(true);
  });

  it('strips tags, decodes entities and keeps non-Latin names', () => {
    const lineup = byKey(canada, '21_2');
    expect(lineup.beats[1]?.text).toContain("O'Connor");
    expect(lineup.beats[1]?.mentions.map((m) => m.name)).toContain("O'Connor");
    const chance = byKey(cacio, '171_2');
    expect(chance.beats.some((b) => b.text.includes('林 (Lin) 祖航 (Zuhang)'))).toBe(true);
    expect(byKey(cacio, '401_2').beats[0]?.text).toContain('Paavo Hõbemägi');
    expect(JSON.stringify(cacio.events)).not.toMatch(/<[a-z]|&[a-z#0-9]+;/i);
  });

  it('decodes formation codes and fills the broken formation placeholder', () => {
    expect(byKey(canada, '20_2', 0).data).toEqual({
      kind: 'formation',
      side: 'home',
      formation: { defenders: 3, midfielders: 5, attackers: 2, label: '3-5-2' },
    });
    expect(byKey(canada, '20_2', 0).beats[0]?.text).toBe(
      'Canada had chosen a strategic 3-5-2 formation.',
    );
    expect(byKey(canada, '20_2', 1).beats[0]?.text).toBe(
      'Nederland had chosen a strategic 4-4-2 formation.',
    );
    expect(byKey(cacio, '23_1').data).toMatchObject({
      kind: 'formations',
      home: { label: '2-5-3' },
      away: { label: '2-5-3' },
    });
    expect(JSON.stringify(real.matches)).not.toContain('Replacement Error');
  });

  it('resolves the team side, including special-event chances outside the documented ranges', () => {
    expect(byKey(canada, '121_1').side).toBe('home');
    expect(byKey(canada, '162_2').side).toBe('away');
    expect(byKey(canada, '219_1').side).toBe('away');
    expect(byKey(canada, '45_1').side).toBeUndefined();
    // SubjectTeamID on stadium events is the total seats, not a team.
    expect(byKey(cacio, '32_2').side).toBeUndefined();
  });

  it('keeps unsupported ID fields raw and drops zeros', () => {
    const goal = byKey(canada, '121_1');
    expect(goal).toMatchObject({
      subjectTeamId: 3010,
      subjectPlayerId: 3497216,
      objectPlayerId: 2461515,
    });
    expect(byKey(canada, '45_1')).not.toHaveProperty('subjectTeamId');
  });

  it('reads weather, attendance and added time', () => {
    expect(byKey(canada, '33_2').data).toEqual({
      kind: 'weather',
      weather: 'sunny',
      venue: 'stadium',
      spectators: 59222,
    });
    expect(byKey(cacio, '32_2').data).toEqual({
      kind: 'weather',
      weather: 'fair',
      venue: 'stadium',
      arenaId: 3241044,
      spectators: 17417,
      capacity: 17417,
    });
    expect(byKey(cacio, '464_1').data).toEqual({ kind: 'attendance', spectators: 17417 });
    expect(byKey(cacio, '75_4').data).toEqual({ kind: 'addedTime', minutes: 2 });
    expect(byKey(cacio, '454_2').data).toEqual({ kind: 'injuryWeeks', weeks: 1 });
  });

  it('derives the running score from goal events and matches the reported score', () => {
    expect(runningScore(cacio.events)).toEqual({ home: 1, away: 4 });
    expect(cacio.spoilers.reportedScore).toEqual({ home: 1, away: 4 });
    expect(runningScore(canada.events)).toEqual({ home: 1, away: 1 });
    expect(shootoutScore(canada.events)).toEqual({ home: 2, away: 1 });
    // Reported score includes the shoot-out.
    expect(canada.spoilers.reportedScore).toEqual({ home: 3, away: 2 });
  });

  it('reads substitutions with the team side', () => {
    expect(canada.substitutions).toEqual([]);
    expect(cacio.substitutions).toEqual([
      {
        teamId: 3273798,
        side: 'away',
        playerOutId: 513148586,
        playerInId: 513188595,
        orderType: 1,
        newPositionId: 100,
        newPositionBehaviour: 0,
        minute: 33,
      },
    ]);
  });

  it('keeps final-result data out of the match itself', () => {
    expect(Object.keys(cacio)).not.toContain('homeGoals');
    expect(cacio.pollHint).toBeUndefined();
  });

  it('maps shoot-out, extra-time and end-of-match events', () => {
    expect(byKey(canada, '71_1')).toMatchObject({ part: 4, minute: 120, group: 'penaltyShootout' });
    expect(byKey(canada, '70_2').group).toBe('extraTime');
    expect(byKey(canada, '273_1')).toMatchObject({ part: 3, group: 'miss', side: 'away' });
    expect(byKey(canada, '599_3').group).toBe('fullTime');
    expect(byKey(cacio, '550_1').beats).toEqual([]);
  });
});

describe('live 2.3, report mode (synthetic sample)', () => {
  const reportLog: UnknownEventKey[] = [];
  const report = parseLive(reportXml, { logUnknownKey: (e) => reportLog.push(e) });
  const [played, upcoming] = report.matches as [Match, Match];

  it('handles empty, self-closing and plain report texts', () => {
    expect(played.events.map((e) => e.key)).toEqual([
      '598_1',
      '121_1',
      '332_1',
      '45_1',
      'not-a-key',
      '999_1',
    ]);
    expect(played.events[0]?.beats).toEqual([]);
    expect(played.events[2]?.beats).toEqual([]);
    expect(played.events[1]?.beats).toEqual([
      {
        text: 'Sam Home scored with a chip. 1 - 0.',
        mentions: [{ kind: 'player', name: 'Sam Home', side: 'home', playerId: 501 }],
      },
    ]);
    expect(played.events[3]?.beats[0]?.text).toBe('Half time. 1 – 0.');
  });

  it('keeps events with unknown or unreadable keys and logs each with a sample text', () => {
    const unreadable = played.events.find((e) => e.key === 'not-a-key');
    expect(unreadable).toMatchObject({
      typeId: 0,
      group: 'unknown',
      category: 'info',
      known: false,
    });
    expect(unreadable?.beats[0]?.text).toBe('Unreadable key: kept and logged.');
    expect(played.events.find((e) => e.key === '999_1')).toMatchObject({
      known: false,
      category: 'info',
    });
    expect(report.unknownKeys).toEqual([
      {
        keys: ['not-a-key'],
        count: 1,
        matchId: 1000001,
        index: 6,
        sampleText: 'Unreadable key: kept and logged.',
      },
      {
        typeId: 999,
        keys: ['999_1'],
        count: 1,
        matchId: 1000001,
        index: 7,
        sampleText: 'An event type that is not in the official table.',
      },
    ]);
    expect(reportLog).toEqual(report.unknownKeys);
  });

  it('skips only events it cannot place in the match, with a warning and sample text', () => {
    expect(report.warnings).toEqual([
      'Skipped event 8 (key "45_1", minute 62, part undefined): "No match part: cannot be placed, so it is skipped with a warning."',
    ]);
  });

  it('accepts teams without lineups and upcoming matches with an empty event list', () => {
    expect(played.home.lineup).toEqual([]);
    expect(upcoming.events).toEqual([]);
    expect(upcoming.spoilers).toEqual({});
  });

  it('logs to console.warn by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    parseLive(reportXml);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toBe(
      '[chpp] Unknown event key 999_1 (x1, match 1000001 index 7): "An event type that is not in the official table."',
    );
    warn.mockRestore();
  });
});

describe('live 2.3, match in progress (synthetic sample)', () => {
  it('reads the app-only poll hint', () => {
    const [m] = parseLive(inProgressXml).matches as [Match];
    expect(m.pollHint).toEqual({ nextEventMinute: 24, nextEventMatchPart: 1 });
    expect(m.events[0]?.beats.map((b) => b.text)).toEqual(['A late tackle.', 'Yellow card.']);
    expect(m.events[0]?.side).toBe('away');
  });
});
