import { cardKind, chanceInfo, type ChanceInfo } from '../model/event-types';
import type { EventGroup, MatchEvent, Side, Team } from '../model/types';
import type { Mood, Speaker } from '../model/voice';
import { fillTemplate, ordinal } from './fill';
import type { EventLineContext, Line, LineWriter } from './line';
import { createVariantPicker, type VariantPicker } from './picker';
import { templatesFor, type Topic } from './templates';

/**
 * Template-based LineWriter. When CHPP sends event text, its beats are the play-by-play (spoken
 * one by one); templates add the analyst's reaction, and the lead's call only when there is no
 * text (report mode). Context events (stories, stakes, form, ...) are read by the analyst.
 */

export interface TemplateWriterOptions {
  random: () => number;
  /** A variant is not reused within this window. */
  cooldownMs?: number;
  /** Line lifetimes. */
  leadTtlMs?: number;
  analystTtlMs?: number;
}

/** Groups the lead calls; everything else is background for the analyst. */
const LEAD_GROUPS: ReadonlySet<EventGroup> = new Set<EventGroup>([
  'kickoff',
  'halfTime',
  'secondHalf',
  'extraTime',
  'fullTime',
  'addedTime',
  'noAddedTime',
  'goal',
  'miss',
  'assist',
  'card',
  'injury',
  'substitution',
  'specialEvent',
  'weatherEffect',
  'penaltyShootout',
  'result',
  'walkover',
]);

export const PRIORITY = {
  goal: 100,
  leadEvent: 80,
  analystReaction: 50,
  analystContext: 30,
} as const;

const SITUATION_PHRASE: Record<NonNullable<ChanceInfo['situation']>, string> = {
  freeKick: 'from a free kick',
  middle: 'through the middle',
  leftWing: 'down the left',
  rightWing: 'down the right',
  penalty: 'from the penalty spot',
};

export function createTemplateWriter(
  options: TemplateWriterOptions,
): LineWriter & { picker: VariantPicker } {
  const picker = createVariantPicker({
    cooldownMs: options.cooldownMs ?? 20 * 60_000,
    random: options.random,
  });
  const leadTtl = options.leadTtlMs ?? 60_000;
  const analystTtl = options.analystTtlMs ?? 120_000;

  function templated(
    topic: Topic,
    speaker: Speaker,
    values: Record<string, string | undefined>,
    now: number,
  ) {
    const fillable = templatesFor(topic, speaker)
      .map((t) => ({ ...t, filled: fillTemplate(t.text, values) }))
      .filter((t): t is typeof t & { filled: string } => t.filled !== undefined);
    const chosen = picker.pick(fillable, now);
    return chosen;
  }

  return {
    picker,
    linesForEvent(ctx: EventLineContext): Line[] {
      const { event, now } = ctx;
      const values = placeholderValues(ctx);
      const topics = topicsFor(event);
      const lines: Line[] = [];
      const isLead = LEAD_GROUPS.has(event.group);
      const isGoal = event.group === 'goal';
      let n = 0;
      const id = () => `e${event.index}.${n++}`;

      // 1. Play-by-play: Hattrick's beats, or a templated call when there is no text.
      if (event.beats.length > 0) {
        const speaker: Speaker = isLead ? 'lead' : 'analyst';
        event.beats.forEach((beat, i) => {
          const last = i === event.beats.length - 1;
          const { mood, intensity } = beatExpression(event, i, event.beats.length);
          lines.push({
            id: id(),
            speaker,
            text: beat.text,
            mood,
            intensity,
            priority: isGoal
              ? PRIORITY.goal
              : isLead
                ? PRIORITY.leadEvent
                : PRIORITY.analystContext,
            interruptible: !(isGoal && last),
            expiresAt: now + (isLead ? leadTtl : analystTtl),
            eventIndex: event.index,
          });
        });
      } else {
        const callTopic = topics.find((t) =>
          templatesFor(t, 'lead').some((x) => fillTemplate(x.text, values)),
        );
        const call = callTopic ? templated(callTopic, 'lead', values, now) : undefined;
        if (call) {
          lines.push({
            id: id(),
            speaker: 'lead',
            text: call.filled,
            mood: call.mood,
            intensity: call.intensity,
            priority: isGoal ? PRIORITY.goal : PRIORITY.leadEvent,
            interruptible: !isGoal,
            expiresAt: now + leadTtl,
            templateId: call.id,
            eventIndex: event.index,
          });
        }
      }

      // 2. The analyst's reaction: how and why.
      const analystTopic = topics.find((t) => templatesFor(t, 'analyst').length > 0);
      const reaction = analystTopic ? templated(analystTopic, 'analyst', values, now) : undefined;
      if (reaction) {
        lines.push({
          id: id(),
          speaker: 'analyst',
          text: reaction.filled,
          mood: reaction.mood,
          intensity: reaction.intensity,
          priority: PRIORITY.analystReaction,
          interruptible: true,
          expiresAt: now + analystTtl,
          templateId: reaction.id,
          eventIndex: event.index,
        });
      }

      return lines;
    },
  };
}

/** Topics for an event, most specific first. */
export function topicsFor(event: MatchEvent): Topic[] {
  switch (event.group) {
    case 'kickoff':
      return ['kickoff'];
    case 'halfTime':
      return ['halfTime'];
    case 'fullTime':
      return ['fullTime'];
    case 'goal': {
      const context = chanceInfo(event.typeId)?.context;
      return context ? [`goal.${context}` as Topic, 'goal'] : ['goal'];
    }
    case 'miss':
      return ['miss'];
    case 'card':
      return cardKind(event.typeId) === 'yellow'
        ? ['card.yellow']
        : cardKind(event.typeId)
          ? ['card.red']
          : [];
    case 'injury':
      // 424-427 are replacements and 454 the doctor's report: no injury call for those.
      return (event.typeId >= 90 && event.typeId <= 97) ||
        (event.typeId >= 401 && event.typeId <= 423)
        ? ['injury']
        : [];
    default:
      return [];
  }
}

function beatExpression(
  event: MatchEvent,
  i: number,
  count: number,
): { mood: Mood; intensity: number } {
  const last = i === count - 1;
  const build = count > 1 ? 0.4 + (0.4 * i) / (count - 1) : 0.6;
  switch (event.group) {
    case 'goal':
      return last ? { mood: 'excited', intensity: 1 } : { mood: 'anticipation', intensity: build };
    case 'miss':
      return last ? { mood: 'tense', intensity: 0.8 } : { mood: 'anticipation', intensity: build };
    case 'penaltyShootout':
      return { mood: 'tense', intensity: Math.max(0.7, build) };
    case 'card':
      return { mood: 'tense', intensity: 0.6 };
    case 'injury':
      return { mood: 'concerned', intensity: 0.5 };
    case 'kickoff':
    case 'secondHalf':
    case 'extraTime':
      return { mood: 'anticipation', intensity: 0.7 };
    case 'fullTime':
    case 'result':
      return { mood: 'celebratory', intensity: 0.7 };
    default:
      return { mood: 'neutral', intensity: 0.4 };
  }
}

function placeholderValues(ctx: EventLineContext): Record<string, string | undefined> {
  const { event, home, away, score } = ctx;
  const side = event.side;
  const team = side ? teamOf(side, home, away) : undefined;
  const opponent = side ? teamOf(side === 'home' ? 'away' : 'home', home, away) : undefined;
  const info = chanceInfo(event.typeId);
  return {
    homeTeam: home.shortName || home.name,
    awayTeam: away.shortName || away.name,
    team: team ? team.shortName || team.name : undefined,
    opponent: opponent ? opponent.shortName || opponent.name : undefined,
    player: playerName(event, home, away),
    scoreline: `${home.shortName || home.name} ${score.home}, ${away.shortName || away.name} ${score.away}`,
    minute: event.minute > 0 ? `${ordinal(event.minute)} minute` : undefined,
    situation: info?.counter
      ? 'on the counter'
      : info?.situation
        ? SITUATION_PHRASE[info.situation]
        : undefined,
  };
}

function teamOf(side: Side, home: Team, away: Team): Team {
  return side === 'home' ? home : away;
}

/** Main player: the mention matching SubjectPlayerID, else the first mention from the event's side. */
function playerName(event: MatchEvent, home: Team, away: Team): string | undefined {
  const mentions = event.beats.flatMap((b) => b.mentions).filter((m) => m.kind === 'player');
  const bySubject = mentions.find(
    (m) => m.playerId !== undefined && m.playerId === event.subjectPlayerId,
  );
  if (bySubject) return bySubject.name;
  const bySide = mentions.find((m) => m.side === event.side);
  if (bySide) return bySide.name;
  if (event.subjectPlayerId !== undefined) {
    const player = [...home.lineup, ...away.lineup].find((p) => p.id === event.subjectPlayerId);
    if (player) return player.name;
  }
  return undefined;
}
