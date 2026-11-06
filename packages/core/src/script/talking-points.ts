import type {
  ContextFact,
  ContextFactKind,
  MatchEvent,
  MatchHeader,
  Score,
  Side,
  Team,
} from '../model/types';
import type { Mood, Speaker } from '../model/voice';
import { fillTemplate, ordinal } from './fill';
import type { Line } from './line';
import { createVariantPicker } from './picker';

/**
 * Gap fillers: background facts ranked by relevance to the match situation, with cooldowns per
 * fact and per topic so nothing repeats immediately. There is always something to say: when
 * every fact is cooling down, a score reminder or an atmosphere line fills the gap (rule 5).
 */

export interface MatchSituation {
  now: number;
  /** Minute of play; negative before kick-off. */
  minute: number;
  score: Score;
  home: Team;
  away: Team;
}

export interface TalkingPointsOptions {
  random: () => number;
  /** A fact is not used again within this window. */
  factCooldownMs?: number;
  /** A topic (fact kind) is not used again within this window while others are available. */
  kindCooldownMs?: number;
  /** Filler lifetime. */
  ttlMs?: number;
}

export interface TalkingPoints {
  add(facts: readonly ContextFact[]): void;
  readonly facts: readonly ContextFact[];
  /** The best line to fill a gap right now. Never undefined. */
  next(situation: MatchSituation): Line;
}

export const FILLER_PRIORITY = 10;

interface Phrase {
  speaker: Speaker;
  text: string;
  mood: Mood;
  intensity: number;
}

const p = (
  text: string,
  mood: Mood = 'calm',
  intensity = 0.4,
  speaker: Speaker = 'analyst',
): Phrase => ({
  speaker,
  text,
  mood,
  intensity,
});

/** Phrasings per fact kind. Placeholders come from the fact's data, side and the situation. */
const PHRASES: Record<ContextFactKind, Phrase[]> = {
  weather: [
    p('Conditions today: {weatherPhrase}'),
    p('Worth remembering the weather. {weatherPhrase}'),
  ],
  arena: [p('A fine setting for football here at {arena}.'), p("We're at {arena} for this one.")],
  attendance: [
    p('{spectators} spectators in the stands today.'),
    p('A crowd of {spectators} watching this one.'),
    p("They're making some noise, all {spectators} of them."),
  ],
  derby: [
    p("It's a derby, remember. Local pride is at stake.", 'anticipation', 0.5),
    p('Derby day. Nobody here wants to go home on the losing side.', 'anticipation', 0.5),
  ],
  neutralGround: [
    p('A neutral ground today, so no real home advantage.'),
    p('Neither side is truly at home here.'),
  ],
  standings: [p('{text}'), p('In the table: {text}')],
  form: [p('Remember the form coming into this. {text}'), p('{text}')],
  headToHead: [p('These two have history. {text}'), p('{text}')],
  manager: [p('{text}'), p('From the dugout: {text}')],
  formation: [
    p('{team} have set up in a {formation}.'),
    p("{team}'s shape today is a {formation}."),
    p('That {formation} from {team} is worth watching.'),
  ],
  player: [p('{text}'), p('Keep an eye on {player} for {team}.')],
  stakes: [p("There's a lot riding on this. {text}", 'tense', 0.5), p('{text}', 'tense', 0.5)],
  story: [p('{text}'), p('A little story for you. {text}')],
  score: [
    p('{scoreline}, in the {minute}.', 'neutral', 0.4, 'lead'),
    p("It's {scoreline} as we go on.", 'neutral', 0.4, 'lead'),
    p('The score: {scoreline}.', 'neutral', 0.4, 'lead'),
  ],
  atmosphere: [
    p('The crowd are right behind their team.', 'neutral', 0.4, 'lead'),
    p('Both sides probing, looking for an opening.', 'neutral', 0.4, 'lead'),
    p('A patient spell of possession here.', 'calm', 0.35, 'lead'),
    p('The fans are getting restless, waiting for something to happen.', 'neutral', 0.4, 'lead'),
  ],
};

const WEATHER_PHRASE: Record<string, string> = {
  rain: 'it is raining, and a wet pitch makes the ball skid.',
  cloudy: 'grey skies, but decent conditions for football.',
  fair: 'fair weather, nothing to complain about.',
  sunny: 'bright sunshine, and the heat could tell later on.',
};

/** How much a fact kind matters at a given minute, 0..1. */
export function situationWeight(kind: ContextFactKind, situation: MatchSituation): number {
  const m = situation.minute;
  const early = m <= 20;
  const late = m >= 65;
  const close = Math.abs(situation.score.home - situation.score.away) <= 1;
  switch (kind) {
    case 'weather':
    case 'arena':
    case 'formation':
      return early ? 1 : 0.4;
    case 'attendance':
    case 'derby':
    case 'neutralGround':
    case 'headToHead':
      return early ? 0.9 : 0.5;
    case 'form':
    case 'manager':
    case 'story':
    case 'player':
      return 0.7;
    case 'standings':
    case 'stakes':
      return late ? (close ? 1 : 0.8) : 0.5;
    case 'score':
      return m > 0 ? 0.3 : 0;
    case 'atmosphere':
      return 0.1;
  }
}

export function createTalkingPoints(options: TalkingPointsOptions): TalkingPoints {
  const factCooldown = options.factCooldownMs ?? 8 * 60_000;
  const kindCooldown = options.kindCooldownMs ?? 3 * 60_000;
  const ttl = options.ttlMs ?? 30_000;
  const phrasePicker = createVariantPicker({ cooldownMs: 15 * 60_000, random: options.random });
  const facts = new Map<string, ContextFact>();
  const factUsed = new Map<string, number>();
  const kindUsed = new Map<ContextFactKind, number>();
  let lastFactId: string | undefined;
  let lastKind: ContextFactKind | undefined;
  let count = 0;

  const SCORE: ContextFact = { id: 'score', kind: 'score', relevance: 0.5 };
  const ATMOSPHERE: ContextFact = { id: 'atmosphere', kind: 'atmosphere', relevance: 0.5 };

  function cooling(fact: ContextFact, now: number): boolean {
    const used = factUsed.get(fact.id);
    return used !== undefined && now - used < factCooldown;
  }

  function score(fact: ContextFact, situation: MatchSituation): number {
    const kindAt = kindUsed.get(fact.kind);
    const kindPenalty = kindAt !== undefined && situation.now - kindAt < kindCooldown ? 0.3 : 1;
    return fact.relevance * situationWeight(fact.kind, situation) * kindPenalty;
  }

  function phrase(fact: ContextFact, situation: MatchSituation) {
    const values = valuesFor(fact, situation);
    const options = PHRASES[fact.kind]
      .map((ph, i) => ({ ...ph, id: `${fact.id}.${i}`, filled: fillTemplate(ph.text, values) }))
      .filter((ph): ph is typeof ph & { filled: string } => ph.filled !== undefined);
    return phrasePicker.pick(options, situation.now);
  }

  return {
    get facts() {
      return [...facts.values()];
    },
    add(list) {
      for (const f of list) if (!facts.has(f.id)) facts.set(f.id, f);
    },
    next(situation) {
      const candidates = [...facts.values(), SCORE]
        .filter((f) => f.id !== lastFactId && !cooling(f, situation.now))
        .map((f) => ({ f, s: score(f, situation) }))
        .filter((c) => c.s > 0)
        .sort(
          (a, b) => b.s - a.s || (a.f.kind === lastKind ? 1 : 0) - (b.f.kind === lastKind ? 1 : 0),
        );

      // Last resort: alternate atmosphere and the score so even fillers do not repeat back to back.
      const fallback =
        lastFactId === ATMOSPHERE.id && situation.minute > 0
          ? [SCORE, ATMOSPHERE]
          : [ATMOSPHERE, SCORE];
      for (const f of [...candidates.map((c) => c.f), ...fallback]) {
        const chosen = phrase(f, situation);
        if (!chosen) continue;
        factUsed.set(f.id, situation.now);
        kindUsed.set(f.kind, situation.now);
        lastFactId = f.id;
        lastKind = f.kind;
        return {
          id: `tp${count++}`,
          speaker: chosen.speaker,
          text: chosen.filled,
          mood: chosen.mood,
          intensity: chosen.intensity,
          priority: FILLER_PRIORITY,
          interruptible: true,
          expiresAt: situation.now + ttl,
          templateId: chosen.id,
          factId: f.id,
        };
      }
      // Unreachable: atmosphere phrases have no placeholders.
      throw new Error('no filler available');
    },
  };
}

function valuesFor(
  fact: ContextFact,
  situation: MatchSituation,
): Record<string, string | undefined> {
  const team = fact.side ? (fact.side === 'home' ? situation.home : situation.away) : undefined;
  const data = fact.data ?? {};
  const str = (k: string) => (data[k] !== undefined ? String(data[k]) : undefined);
  const weather = str('weather');
  return {
    text: fact.text,
    team: team ? team.shortName || team.name : undefined,
    player: str('player'),
    formation: str('formation'),
    arena: str('arena'),
    spectators:
      data['spectators'] !== undefined ? groupThousands(Number(data['spectators'])) : undefined,
    weatherPhrase: weather ? WEATHER_PHRASE[weather] : undefined,
    scoreline: `${situation.home.shortName || situation.home.name} ${situation.score.home}, ${
      situation.away.shortName || situation.away.name
    } ${situation.score.away}`,
    minute: situation.minute > 0 ? `${ordinal(situation.minute)} minute` : undefined,
  };
}

/** 17417 -> "17,417" (locale-independent). */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Fact extraction

/** Facts known from the lineups. */
export function factsFromHeader(header: MatchHeader): ContextFact[] {
  const facts: ContextFact[] = [];
  for (const side of ['home', 'away'] as const) {
    const team = side === 'home' ? header.home : header.away;
    const taker = team.lineup.find((pl) => pl.id === team.setPieceTakerId);
    if (taker) {
      facts.push({
        id: `setpieces.${side}`,
        kind: 'player',
        side,
        text: `${taker.name} takes the set pieces for ${team.shortName || team.name}.`,
        data: { player: taker.name },
        relevance: 0.5,
      });
    }
    const keeper = team.lineup.find((pl) => pl.roleId === 100);
    if (keeper) {
      facts.push({
        id: `keeper.${side}`,
        kind: 'player',
        side,
        text: `${keeper.name} is in goal for ${team.shortName || team.name}.`,
        data: { player: keeper.name },
        relevance: 0.4,
      });
    }
  }
  return facts;
}

/**
 * Facts revealed by an event. Hattrick's own sentence is kept as `text` for context events; it is
 * spoken when the event arrives, so phrasings that reuse it are for later gaps.
 */
export function factsFromEvent(event: MatchEvent): ContextFact[] {
  const facts: ContextFact[] = [];
  const data = event.data;
  const side: { side?: Side } = event.side ? { side: event.side } : {};
  const sentence = event.beats.map((b) => b.text).join(' ') || undefined;
  const withText = sentence ? { text: sentence } : {};

  if (data?.kind === 'weather') {
    facts.push({ id: 'weather', kind: 'weather', data: { weather: data.weather }, relevance: 0.7 });
    if (data.spectators !== undefined) {
      facts.push({
        id: 'attendance',
        kind: 'attendance',
        data: { spectators: data.spectators },
        relevance: 0.5,
      });
    }
  }
  if (data?.kind === 'attendance') {
    facts.push({
      id: 'attendance',
      kind: 'attendance',
      data: { spectators: data.spectators },
      relevance: 0.6,
    });
  }
  if (data?.kind === 'formation' && event.side) {
    facts.push({
      id: `formation.${event.side}`,
      kind: 'formation',
      side: event.side,
      data: { formation: data.formation.label },
      relevance: 0.6,
    });
  }
  if (data?.kind === 'formations') {
    for (const s of ['home', 'away'] as const) {
      const f = data[s];
      if (f)
        facts.push({
          id: `formation.${s}`,
          kind: 'formation',
          side: s,
          data: { formation: f.label },
          relevance: 0.6,
        });
    }
  }

  const byGroup: Partial<Record<MatchEvent['group'], ContextFactKind>> = {
    derby: 'derby',
    neutralGround: 'neutralGround',
    headToHead: 'headToHead',
    form: 'form',
    stakes: 'stakes',
    story: 'story',
    managerQuote: 'manager',
  };
  const kind = byGroup[event.group];
  if (kind && (sentence || kind === 'derby' || kind === 'neutralGround')) {
    facts.push({
      id: `${kind}.${event.typeId}.${event.side ?? 'n'}`,
      kind,
      ...side,
      ...withText,
      relevance: 0.6,
    });
  }
  return facts;
}
