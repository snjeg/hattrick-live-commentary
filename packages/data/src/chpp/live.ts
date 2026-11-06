import {
  addedMinutesFromText,
  decodeFormation,
  eventGroup,
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
  /** Non-fatal problems, e.g. events skipped for an unreadable key. */
  warnings: string[];
}

/** Events whose SubjectTeamID holds something else (docs/chpp-event-types.md). */
const SUBJECT_TEAM_NOT_A_TEAM: ReadonlySet<number> = new Set([30, 31, 32, 33]);

/** Set-piece taker row in the starting lineup (not a position). */
const SET_PIECE_ROLE = 18;

export function parseLive(xml: string): LiveResponse {
  const doc = parseXml(xml);
  const warnings: string[] = [];
  const matches = children(child(doc, 'MatchList'), 'Match').map((m) => parseMatch(m, warnings));
  const fileName = childText(doc, 'FileName');
  const version = childText(doc, 'Version');
  const fetched = childText(doc, 'FetchedDate');
  return {
    ...(fileName ? { fileName } : {}),
    ...(version ? { version } : {}),
    ...(fetched ? { fetchedDate: toIsoLocal(fetched) } : {}),
    matches,
    warnings,
  };
}

/** "2003-07-18 20:00:00" -> "2003-07-18T20:00:00" (Hattrick time, no zone). */
export function toIsoLocal(value: string): string {
  return value.trim().replace(' ', 'T');
}

function parseMatch(m: XmlElement, warnings: string[]): Match {
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
    const parsed = parseEvent(e, sideOfTeam, warnings);
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
    matchId: childInt(m, 'MatchID') ?? 0,
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
  warnings: string[],
): MatchEvent | undefined {
  const indexAttr = e.attributes['Index'];
  const index = indexAttr !== undefined && /^\d+$/.test(indexAttr) ? Number(indexAttr) : undefined;
  const key = childText(e, 'EventKey') ?? '';
  const parsedKey = parseEventKey(key);
  const minute = childInt(e, 'Minute');
  const part = childInt(e, 'MatchPart');
  if (
    index === undefined ||
    !parsedKey ||
    minute === undefined ||
    part === undefined ||
    !isMatchPart(part)
  ) {
    warnings.push(
      `Skipped event ${indexAttr ?? '?'} (key "${key}", minute ${minute}, part ${part})`,
    );
    return undefined;
  }
  const { typeId, variant } = parsedKey;

  // Unsupported ID fields: keep them raw (0 means none) but never depend on them.
  const subjectTeamId = nonZero(childInt(e, 'SubjectTeamID'));
  const subjectPlayerId = nonZero(childInt(e, 'SubjectPlayerID'));
  const objectPlayerId = nonZero(childInt(e, 'ObjectPlayerID'));

  const html = childText(e, 'EventText') ?? '';
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
    group: eventGroup(typeId),
    ...(side ? { side } : {}),
    ...(subjectTeamId !== undefined ? { subjectTeamId } : {}),
    ...(subjectPlayerId !== undefined ? { subjectPlayerId } : {}),
    ...(objectPlayerId !== undefined ? { objectPlayerId } : {}),
    beats,
    ...(data ? { data } : {}),
  };
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
