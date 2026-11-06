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
  /**
   * Adds facts (duplicates by id are ignored). Pass `spokenAt` when the facts were just read out
   * (e.g. an event's own text), so their cooldown starts now and they do not come straight back.
   */
  add(facts: readonly ContextFact[], spokenAt?: number): void;
  readonly facts: readonly ContextFact[];
  /** The best line to fill a gap right now. Never undefined. */
  next(situation: MatchSituation): Line;
  /** Like `next`, but only material that is not cooling down; undefined when nothing is fresh. */
  fresh(situation: MatchSituation): Line | undefined;
}

export const FILLER_PRIORITY = 10;

interface Phrase {
  speaker: Speaker;
  text: string;
  mood: Mood;
  intensity: number;
  /** Only usable in this match state. */
  when?: (s: MatchSituation) => boolean;
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

const goals = (s: MatchSituation) => s.score.home + s.score.away;
const margin = (s: MatchSituation) => Math.abs(s.score.home - s.score.away);
const level = (s: MatchSituation) => margin(s) === 0;

const lead = (text: string, when?: Phrase['when']): Phrase => ({
  ...p(text, 'neutral', 0.4, 'lead'),
  ...(when ? { when } : {}),
});
const analyst = (text: string, when?: Phrase['when']): Phrase => ({
  ...p(text, 'calm', 0.4, 'analyst'),
  ...(when ? { when } : {}),
});

/** Phrasings per fact kind. Placeholders come from the fact's data, side and the situation. */
const PHRASES: Record<ContextFactKind, Phrase[]> = {
  weather: [
    p('Conditions today: {weatherPhrase}'),
    p('Worth remembering the weather: {weatherPhrase}'),
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
  manager: [p('{text}')],
  formation: [
    p('{team} have set up in a {formation}.'),
    p("{team}'s shape today is a {formation}."),
    p('That {formation} from {team} is worth watching.'),
  ],
  player: [
    p('{text}'),
    p('Keep an eye on {player} for {team}.'),
    p('{player} is in the {team} side today.'),
  ],
  stakes: [p("There's a lot riding on this. {text}", 'tense', 0.5), p('{text}', 'tense', 0.5)],
  story: [p('{text}')],
  score: [
    p('{scoreline}, in the {minute}.', 'neutral', 0.4, 'lead'),
    p("It's {scoreline} as we go on.", 'neutral', 0.4, 'lead'),
    p('The score: {scoreline}.', 'neutral', 0.4, 'lead'),
  ],
  // Atmosphere and match-state colour: never claims match action that the data does not show.
  atmosphere: [
    lead('The crowd are right behind their team.'),
    lead('You can hear the supporters from every corner of the ground.'),
    lead('The fans are getting restless, waiting for something to happen.', (s) => s.minute > 10),
    lead('A real buzz around the stadium.'),
    lead('Plenty of singing from the stands.'),
    lead('The away supporters are making themselves heard.'),
    lead('Flags waving all around the ground.'),
    lead('The noise drops for a moment, then builds again.', (s) => s.minute > 0),
    lead('Still goalless here.', (s) => goals(s) === 0 && s.minute > 5),
    lead('No goals yet, but plenty of tension.', (s) => goals(s) === 0 && s.minute > 15),
    lead('Nothing to separate the sides yet.', (s) => level(s) && s.minute > 5),
    lead('All square, and one goal could change everything.', (s) => level(s) && s.minute > 30),
    lead('Honours even for now.', (s) => level(s) && goals(s) > 0),
    lead('{leader} are ahead, and {trailer} need a response.', (s) => margin(s) === 1),
    lead('Just the one goal in it.', (s) => margin(s) === 1),
    lead('{leader} will want to see this one out.', (s) => margin(s) >= 1 && s.minute >= 60),
    lead('{trailer} have work to do.', (s) => margin(s) >= 2),
    lead('{leader} are well in control of this one.', (s) => margin(s) >= 2),
    lead('A comfortable lead for {leader}.', (s) => margin(s) >= 3),
    lead('{trailer} are chasing the game now.', (s) => margin(s) >= 1 && s.minute >= 30),
    lead('A cagey start from both sides.', (s) => s.minute > 0 && s.minute <= 15),
    lead('Early days yet.', (s) => s.minute > 0 && s.minute <= 20),
    lead("We're into the {minute}.", (s) => s.minute > 0),
    lead('Half an hour gone.', (s) => s.minute >= 30 && s.minute <= 34),
    lead('Approaching half time.', (s) => s.minute >= 38 && s.minute <= 45),
    lead('Just past the hour mark.', (s) => s.minute >= 60 && s.minute <= 64),
    lead('The clock is starting to matter now.', (s) => s.minute >= 70),
    lead('Into the final stages.', (s) => s.minute >= 80),
    lead('Tired legs out there, surely.', (s) => s.minute >= 75),
    lead('Ten minutes or so to go.', (s) => s.minute >= 79 && s.minute <= 82),
    lead('Not long to wait for kick-off now.', (s) => s.minute <= 0),
    lead('The players are nearly ready.', (s) => s.minute <= 0),
    analyst('Both managers will be watching the shape of their midfield closely.'),
    analyst('Small margins decide matches like this.', (s) => margin(s) <= 1),
    analyst('Concentration is everything in spells like this.', (s) => s.minute > 0),
    analyst('A goal now would change the whole picture.', (s) => s.minute >= 60 && margin(s) <= 1),
    analyst('{trailer} have to take more risks soon.', (s) => s.minute >= 60 && margin(s) >= 1),
    analyst('{leader} can afford to be patient now.', (s) => margin(s) >= 2),
    analyst('{trailer} need something special to get back into this.', (s) => margin(s) >= 3),
    analyst('The next goal is massive for both sides.', (s) => s.minute >= 20 && margin(s) <= 1),
    analyst(
      'Fitness could decide this in the last quarter of an hour.',
      (s) => s.minute >= 65 && s.minute <= 80,
    ),
    analyst(
      'A quiet spell, but the tension has not gone away.',
      (s) => s.minute > 10 && margin(s) <= 1,
    ),
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
      return 0.7;
    case 'player':
      return 0.4;
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
  const PHRASE_COOLDOWN = 20 * 60_000;
  const phrasePicker = createVariantPicker({ cooldownMs: PHRASE_COOLDOWN, random: options.random });
  const facts = new Map<string, ContextFact>();
  const factUsed = new Map<string, number>();
  const kindUsed = new Map<ContextFactKind, number>();
  const uses = new Map<string, number>();
  let lastFactId: string | undefined;
  let lastKind: ContextFactKind | undefined;
  let count = 0;

  const SCORE: ContextFact = { id: 'score', kind: 'score', relevance: 0.5 };
  const SCORE_COOLDOWN = 2 * 60_000;
  const ATMOSPHERE: ContextFact = { id: 'atmosphere', kind: 'atmosphere', relevance: 0.5 };

  function cooling(fact: ContextFact, now: number): boolean {
    const used = factUsed.get(fact.id);
    const cooldown = fact.id === SCORE.id ? SCORE_COOLDOWN : factCooldown;
    return used !== undefined && now - used < cooldown;
  }

  /** Hattrick's own sentences come back at most once; each lineup fact at most twice. */
  function exhausted(fact: ContextFact): boolean {
    const n = uses.get(fact.id) ?? 0;
    if (fact.kind === 'story' || fact.kind === 'manager') return n >= 1;
    if (fact.kind === 'player') return n >= 2;
    if (fact.text && !fact.data) return n >= 2;
    return false;
  }

  function kindCooling(kind: ContextFactKind, now: number): boolean {
    const at = kindUsed.get(kind);
    return at !== undefined && now - at < kindCooldown;
  }

  function score(fact: ContextFact, situation: MatchSituation): number {
    return fact.relevance * situationWeight(fact.kind, situation);
  }

  function phrase(fact: ContextFact, situation: MatchSituation, freshOnly: boolean) {
    const values = valuesFor(fact, situation);
    const options = PHRASES[fact.kind]
      .map((ph, i) => ({ ...ph, id: `${fact.id}.${i}` }))
      .filter((ph) => !ph.when || ph.when(situation))
      .filter((ph) => {
        if (!freshOnly) return true;
        const at = phrasePicker.lastUsed(ph.id);
        return at === undefined || situation.now - at >= PHRASE_COOLDOWN;
      })
      .map((ph) => ({ ...ph, filled: fillTemplate(ph.text, values) }))
      .filter((ph): ph is typeof ph & { filled: string } => ph.filled !== undefined);
    return phrasePicker.pick(options, situation.now);
  }

  return {
    get facts() {
      return [...facts.values()];
    },
    add(list, spokenAt) {
      for (const f of list) {
        if (facts.has(f.id)) continue;
        facts.set(f.id, f);
        if (spokenAt !== undefined) {
          factUsed.set(f.id, spokenAt);
          uses.set(f.id, 1);
        }
      }
    },
    next(situation) {
      const line = choose(situation, false);
      if (!line) throw new Error('no filler available'); // unreachable: atmosphere has unconditional phrases
      return line;
    },
    fresh(situation) {
      return choose(situation, true);
    },
  };

  function choose(situation: MatchSituation, freshOnly: boolean): Line | undefined {
    {
      const ranked = [...facts.values(), SCORE]
        .filter((f) => f.id !== lastFactId && !cooling(f, situation.now) && !exhausted(f))
        .map((f) => ({ f, s: score(f, situation) }))
        .filter((c) => c.s > 0)
        .sort((a, b) => b.s - a.s);
      // A topic that was just covered waits for its cooldown while other topics are available.
      const freshTopics = ranked.filter(
        (c) => c.f.kind !== lastKind && !kindCooling(c.f.kind, situation.now),
      );
      const candidates =
        freshTopics.length > 0 ? freshTopics : ranked.filter((c) => c.f.kind !== lastKind);

      // Last resort: atmosphere and match-state colour (its phrases cool down individually).
      const fallback = [ATMOSPHERE];
      for (const f of [...candidates.map((c) => c.f), ...fallback]) {
        const chosen = phrase(f, situation, freshOnly);
        if (!chosen) continue;
        factUsed.set(f.id, situation.now);
        uses.set(f.id, (uses.get(f.id) ?? 0) + 1);
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
      return undefined;
    }
  }
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
    leader: leaderName(situation, 'leader'),
    trailer: leaderName(situation, 'trailer'),
  };
}

function leaderName(s: MatchSituation, role: 'leader' | 'trailer'): string | undefined {
  if (s.score.home === s.score.away) return undefined;
  const homeAhead = s.score.home > s.score.away;
  const team = (role === 'leader') === homeAhead ? s.home : s.away;
  return team.shortName || team.name;
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
    for (const player of team.lineup) {
      const line = roleLine(player.roleId);
      if (!line || player.roleId === 100 || player.id === team.setPieceTakerId) continue;
      facts.push({
        id: `lineup.${side}.${player.id}`,
        kind: 'player',
        side,
        text: `${player.name} ${line} for ${team.shortName || team.name} today.`,
        data: { player: player.name },
        relevance: 0.3,
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

/** Position from RoleID: 101-105 defence, 106-110 midfield, 111-113 attack. */
function roleLine(roleId: number): string | undefined {
  if (roleId >= 101 && roleId <= 105) return 'plays in defence';
  if (roleId >= 106 && roleId <= 110) return 'plays in midfield';
  if (roleId >= 111 && roleId <= 113) return 'is up front';
  return undefined;
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
