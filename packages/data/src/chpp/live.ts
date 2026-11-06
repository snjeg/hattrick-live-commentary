import {
  addedMinutesFromText,
  decodeFormation,
  classifyEventType,
  isMatchPart,
  parseEventKey,
  venueWeather,
  type EventData,
  type Match,
  type MatchEvent,
  type Player,
  type Side,
  type Substitution,
  type Team,
} from '@hlc/core';
import { plainText, splitBeats } from './event-text';
import { child, childInt, children, childText, parseXml, type XmlElement } from './xml';

/**
 * Parser for CHPP `live` 2.3 (`viewAll` / `viewNew`), in both `useLiveEventsAndTexts` modes.
 * Only fields seen in real fixtures or documented in docs/chpp-*findings.md are read.
 */

export interface LiveResponse {
  fileName?: string;
  version?: string;
  /** CHPP FetchedDate as ISO-like local time. */
  fetchedDate?: string;
  matches: Match[];
  /** Non-fatal problems, e.g. events skipped for a missing minute or match part. */
  warnings: string[];
  /** Event keys not in docs/chpp-event-types.md (or unreadable), one entry per type, with a sample. */
  unknownKeys: UnknownEventKey[];
}

export interface UnknownEventKey {
  /** Type ID, or undefined when the key itself could not be read. */
  typeId?: number;
  /** Every raw EventKey seen for this type, e.g. ["550_2", "550_1"]. */
  keys: string[];
  count: number;
  /** First match and event index where it appeared. */
  matchId: number;
  index: number;
  /** Plain text of the first occurrence that had any (truncated), or "" when all were empty. */
  sampleText: string;
}

export interface ParseLiveOptions {
  /** Called once per unknown type after parsing. Defaults to console.warn. */
  logUnknownKey?: (entry: UnknownEventKey) => void;
}

const SAMPLE_LENGTH = 160;

function defaultLog(entry: UnknownEventKey): void {
  console.warn(
    `[chpp] Unknown event key ${entry.keys.join(', ')} (x${entry.count}, match ${entry.matchId} index ${entry.index}): ` +
      (entry.sampleText ? `"${entry.sampleText}"` : '(no text)'),
  );
}

/** Events whose SubjectTeamID holds something else (docs/chpp-event-types.md). */
const SUBJECT_TEAM_NOT_A_TEAM: ReadonlySet<number> = new Set([30, 31, 32, 33]);

/** Set-piece taker row in the starting lineup (not a position). */
const SET_PIECE_ROLE = 18;

export function parseLive(xml: string, options: ParseLiveOptions = {}): LiveResponse {
  const doc = parseXml(xml);
  const warnings: string[] = [];
  const unknown = new Map<string, UnknownEventKey>();
  const matches = children(child(doc, 'MatchList'), 'Match').map((m) =>
    parseMatch(m, { warnings, unknown }),
  );
  const unknownKeys = [...unknown.values()];
  const log = options.logUnknownKey ?? defaultLog;
  for (const entry of unknownKeys) log(entry);
  const fileName = childText(doc, 'FileName');
  const version = childText(doc, 'Version');
  const fetched = childText(doc, 'FetchedDate');
  return {
    ...(fileName ? { fileName } : {}),
    ...(version ? { version } : {}),
    ...(fetched ? { fetchedDate: toIsoLocal(fetched) } : {}),
    matches,
    warnings,
    unknownKeys,
  };
}

interface ParseContext {
  warnings: string[];
  unknown: Map<string, UnknownEventKey>;
}

/** "2003-07-18 20:00:00" -> "2003-07-18T20:00:00" (Hattrick time, no zone). */
export function toIsoLocal(value: string): string {
  return value.trim().replace(' ', 'T');
}

function parseMatch(m: XmlElement, ctx: ParseContext): Match {
  const matchId = childInt(m, 'MatchID') ?? 0;
  const home = parseTeam(child(m, 'HomeTeam'), 'Home');
  const away = parseTeam(child(m, 'AwayTeam'), 'Away');
  const sideOfTeam = (teamId: number | undefined): Side | undefined =>
    teamId === undefined || teamId === 0
      ? undefined
      : teamId === home.id
        ? 'home'
        : teamId === away.id
          ? 'away'
          : undefined;

  const events: MatchEvent[] = [];
  for (const e of children(child(m, 'EventList'), 'Event')) {
    const parsed = parseEvent(e, sideOfTeam, matchId, ctx);
    if (parsed) events.push(parsed);
  }

  const substitutions = children(child(m, 'Substitutions'), 'Substitution').map((s) =>
    parseSubstitution(s, sideOfTeam),
  );

  const homeGoals = childInt(m, 'HomeGoals');
  const awayGoals = childInt(m, 'AwayGoals');
  const lastShown = childInt(m, 'LastShownEventIndex');
  const nextMinute = childInt(m, 'NextEventMinute');
  const nextPart = childInt(m, 'NextEventMatchPart');

  return {
    matchId,
    sourceSystem: childText(m, 'SourceSystem') ?? 'Hattrick',
    matchType: childInt(m, 'MatchType') ?? 0,
    matchDate: toIsoLocal(childText(m, 'MatchDate') ?? ''),
    home,
    away,
    events,
    substitutions,
    ...(lastShown !== undefined ? { lastShownEventIndex: lastShown } : {}),
    ...(nextMinute !== undefined && nextPart !== undefined && isMatchPart(nextPart)
      ? { pollHint: { nextEventMinute: nextMinute, nextEventMatchPart: nextPart } }
      : {}),
    spoilers:
      homeGoals !== undefined && awayGoals !== undefined
        ? { reportedScore: { home: homeGoals, away: awayGoals } }
        : {},
  };
}

function parseTeam(el: XmlElement | undefined, prefix: 'Home' | 'Away'): Team {
  const lineup: Player[] = [];
  let setPieceTakerId: number | undefined;
  for (const p of children(child(el, 'StartingLineup'), 'Player')) {
    const id = childInt(p, 'PlayerID');
    const roleId = childInt(p, 'RoleID');
    if (id === undefined || roleId === undefined) continue;
    if (roleId === SET_PIECE_ROLE) {
      setPieceTakerId = id;
      continue;
    }
    const behaviour = childInt(p, 'Behaviour');
    lineup.push({
      id,
      name: childText(p, 'PlayerName') ?? '',
      roleId,
      ...(behaviour !== undefined ? { behaviour } : {}),
    });
  }
  return {
    id: childInt(el, `${prefix}TeamID`) ?? 0,
    name: childText(el, `${prefix}TeamName`) ?? '',
    shortName: childText(el, `${prefix}TeamShortName`) ?? childText(el, `${prefix}TeamName`) ?? '',
    lineup,
    ...(setPieceTakerId !== undefined ? { setPieceTakerId } : {}),
  };
}

function parseEvent(
  e: XmlElement,
  sideOfTeam: (teamId: number | undefined) => Side | undefined,
  matchId: number,
  ctx: ParseContext,
): MatchEvent | undefined {
  const indexAttr = e.attributes['Index'];
  const index = indexAttr !== undefined && /^\d+$/.test(indexAttr) ? Number(indexAttr) : undefined;
  const key = childText(e, 'EventKey') ?? '';
  const parsedKey = parseEventKey(key);
  const minute = childInt(e, 'Minute');
  const part = childInt(e, 'MatchPart');
  const html = childText(e, 'EventText') ?? '';
  if (index === undefined || minute === undefined || part === undefined || !isMatchPart(part)) {
    // Without a position in the match the event cannot be scheduled.
    const sample = sampleOf(html);
    ctx.warnings.push(
      `Skipped event ${indexAttr ?? '?'} (key "${key}", minute ${minute}, part ${part})` +
        (sample ? `: "${sample}"` : ''),
    );
    return undefined;
  }
  // An unreadable key or an undocumented type is kept (its text can still be spoken) and logged.
  const typeId = parsedKey?.typeId ?? 0;
  const variant = parsedKey?.variant ?? 0;
  const classified = classifyEventType(typeId);
  if (!parsedKey || !classified.known)
    recordUnknown(ctx, parsedKey?.typeId, key, matchId, index, html);

  // Unsupported ID fields: keep them raw (0 means none) but never depend on them.
  const subjectTeamId = nonZero(childInt(e, 'SubjectTeamID'));
  const subjectPlayerId = nonZero(childInt(e, 'SubjectPlayerID'));
  const objectPlayerId = nonZero(childInt(e, 'ObjectPlayerID'));

  // On some events SubjectTeamID is not a team (30-33: total seats), so it must not pick a side.
  const teamSide = SUBJECT_TEAM_NOT_A_TEAM.has(typeId) ? undefined : sideOfTeam(subjectTeamId);
  const data = eventData(typeId, teamSide, subjectPlayerId, objectPlayerId, subjectTeamId, html);
  const formationLabel = data?.kind === 'formation' ? data.formation.label : undefined;
  const beats = splitBeats(html, formationLabel ? { formationLabel } : {});
  const side = teamSide ?? sideFromMentions(beats.flatMap((b) => b.mentions));

  return {
    index,
    minute,
    part,
    key,
    typeId,
    variant,
    ...classified,
    ...(side ? { side } : {}),
    ...(subjectTeamId !== undefined ? { subjectTeamId } : {}),
    ...(subjectPlayerId !== undefined ? { subjectPlayerId } : {}),
    ...(objectPlayerId !== undefined ? { objectPlayerId } : {}),
    beats,
    ...(data ? { data } : {}),
  };
}

function recordUnknown(
  ctx: ParseContext,
  typeId: number | undefined,
  key: string,
  matchId: number,
  index: number,
  html: string,
): void {
  const id = typeId !== undefined ? `type:${typeId}` : `key:${key}`;
  const sample = sampleOf(html);
  const entry = ctx.unknown.get(id);
  if (!entry) {
    ctx.unknown.set(id, {
      ...(typeId !== undefined ? { typeId } : {}),
      keys: [key],
      count: 1,
      matchId,
      index,
      sampleText: sample,
    });
    return;
  }
  entry.count += 1;
  if (!entry.keys.includes(key)) entry.keys.push(key);
  if (!entry.sampleText && sample) entry.sampleText = sample;
}

function sampleOf(html: string): string {
  const text = plainText(html);
  return text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH - 1)}…` : text;
}

function nonZero(value: number | undefined): number | undefined {
  return value === undefined || value === 0 ? undefined : value;
}

/** Side from player mentions when every player named belongs to one team. */
function sideFromMentions(mentions: { kind: string; side?: Side }[]): Side | undefined {
  const sides = new Set(mentions.filter((m) => m.kind === 'player' && m.side).map((m) => m.side));
  return sides.size === 1 ? [...sides][0] : undefined;
}

function eventData(
  typeId: number,
  side: Side | undefined,
  subject: number | undefined,
  object: number | undefined,
  subjectTeam: number | undefined,
  html: string,
): EventData | undefined {
  const weather = venueWeather(typeId);
  if (weather) {
    // 30-33: SubjectPlayerID arena ID, ObjectPlayerID sold seats, SubjectTeamID seats in total.
    const stadium = typeId >= 30 && typeId <= 33;
    return {
      kind: 'weather',
      ...weather,
      ...(stadium && subject !== undefined ? { arenaId: subject } : {}),
      ...(stadium && object !== undefined ? { spectators: object } : {}),
      ...(stadium && subjectTeam !== undefined ? { capacity: subjectTeam } : {}),
    };
  }

  switch (typeId) {
    case 20: {
      // Team formation: SubjectTeamID = team, ObjectPlayerID = formation code.
      const formation = object !== undefined ? decodeFormation(object) : undefined;
      return formation ? { kind: 'formation', formation, ...(side ? { side } : {}) } : undefined;
    }
    case 23:
    case 24: {
      // Lineup codes: SubjectPlayerID = home, ObjectPlayerID = away (official).
      const home = subject !== undefined ? decodeFormation(subject) : undefined;
      const away = object !== undefined ? decodeFormation(object) : undefined;
      return home || away
        ? { kind: 'formations', ...(home ? { home } : {}), ...(away ? { away } : {}) }
        : undefined;
    }
    case 481: {
      // "New formation today": which field holds the code is not documented, so accept either.
      const formation =
        (object !== undefined ? decodeFormation(object) : undefined) ??
        (subject !== undefined ? decodeFormation(subject) : undefined);
      return formation ? { kind: 'formation', formation, ...(side ? { side } : {}) } : undefined;
    }
    case 464:
      return object !== undefined ? { kind: 'attendance', spectators: object } : undefined;
    case 454:
      return object !== undefined ? { kind: 'injuryWeeks', weeks: object } : undefined;
    case 61:
      return subject !== undefined ? { kind: 'organisation', level: subject } : undefined;
    case 64:
      return object !== undefined ? { kind: 'organisation', level: object } : undefined;
    case 75: {
      const minutes = object ?? addedMinutesFromText(plainText(html));
      return minutes !== undefined ? { kind: 'addedTime', minutes } : undefined;
    }
    case 40:
      // Midfield possession in percent (official).
      return object !== undefined && object <= 100
        ? { kind: 'possession', percent: object, ...(side ? { side } : {}) }
        : undefined;
    default:
      return undefined;
  }
}

function parseSubstitution(
  s: XmlElement,
  sideOfTeam: (teamId: number | undefined) => Side | undefined,
): Substitution {
  const teamId = childInt(s, 'TeamID') ?? 0;
  const side = sideOfTeam(teamId);
  return {
    teamId,
    ...(side ? { side } : {}),
    playerOutId: childInt(s, 'SubjectPlayerID') ?? 0,
    playerInId: childInt(s, 'ObjectPlayerID') ?? 0,
    orderType: childInt(s, 'OrderType') ?? 0,
    newPositionId: childInt(s, 'NewPositionId') ?? 0,
    newPositionBehaviour: childInt(s, 'NewPositionBehaviour') ?? 0,
    minute: childInt(s, 'MatchMinute') ?? 0,
  };
}
