# CHPP findings (Sprint 0 working notes)

Source: CHPP documentation pages pasted by the project owner (file index, `live` 2.3, `matchdetails` 3.1, match event types). Unverified items are marked TODO and must be confirmed with a real fixture.

## Files we plan to use
| File | Version seen | Use |
| --- | --- | --- |
| `live` | up to 2.3 | Event stream: `addMatch`, `viewAll` once, then `viewNew` with `lastShownIndexes` |
| `matchdetails` | up to 3.1 | Pre-match context: arena, `WeatherID`, referee, formations, tactics, match type |
| `matchlineup` | up to 2.1 | Lineups and players |
| `leaguedetails`, `leaguefixtures`, `cupmatches` | see index | Standings, fixtures, cup context |
| `matches`, `matchesarchive` | see index | Recent results, head to head |
| `arenadetails`, `teamdetails`, `players`, `club`, `fans` | see index | Stadium, club, player and fan talking points |
| `translations` | 1.2 | Fetch about once a week and cache |

Do not use: `transfersearch` (not for bots) and any undocumented interface.

## Live flow (`live` 2.3)
1. `addMatch` (matchID, sourceSystem, optional `includeStartingLineup=true`).
2. `viewAll` once, store events locally.
3. `viewNew` with `lastShownIndexes`; use `LastShownEventIndex` from the response.
4. Poll only when `NextEventMinute` / `NextEventMatchPart` are due. These are for the app only: never speak, show or hint at them.
5. Event fields: Minute, MatchPart, EventKey, EventText, SubjectTeamID, SubjectPlayerID, ObjectPlayerID, HomeGoals, AwayGoals. The ID fields are unsupported (own risk); take names from the starting lineup and `EventText`.
- `useLiveEventsAndTexts=true` returns the texts as on the site's live page.
- Error 53 = match not subscribed. Error 59 = request only allowed for teams owned by the requesting user.

## Spoiler rules
- `matchdetails` ratings, chances per side, possession, scorers, bookings, injuries and `AddedMinutes` are final-result data. Never use them while a match is live.
- `TeamAttitude` is visible only to the team's owner.

## Weather
`matchdetails` > `Arena` > `WeatherID` (forecast for upcoming matches). Hattrick's venue events (30 to 33, and 36 to 39) name four weather states: rain, cloudy, fair weather, sunny. The `WeatherID` values probably map to these four, but the number-to-state order is unconfirmed (TODO: data types page, or compare a fixture's `WeatherID` with its event 30-33).

## Event types (EventTypeID)
The documented list has about 400 IDs. Grouped for the script engine:

| IDs | Group | Commentary treatment |
| --- | --- | --- |
| 598, 597, 596, 599 | Match started, second half, extra time, finished | Kick-off, restart and full-time calls, big crowd cue |
| 75, 76 | Added time (75: ObjectPlayerId = added minutes), no added time | Announce added time |
| 100-143, 185-187, 190 | Goals (home 100-143, away 150-184), by situation: free kick, middle, left, right, penalty, counter, long shot; reducing, equalizer, lead, increase | Goal call, roar; wording depends on whether it changes the lead |
| 105-139 (SE) | Special-event goals (unpredictable, quick, corner, head specialist, technical, etc.) | Dedicated flavour lines |
| 200-290 | Missed chances: each goal ID plus 100 is the matching no-goal event (e.g. 111 and 211) | Near-miss gasp, save call |
| 510-514 | Yellow and red cards | Foul reaction, whistle, boos |
| 90-97, 401-427, 473 | Injuries (type, body part, replaced or not), career-ending injury | Concern, pause in crowd noise |
| 350-352, 360-362, 370-372 | Substitutions, tactic changes, position swaps | Tactical analysis lines |
| 380-389 | Man marking | Tactical lines |
| 301-311, 390-391 | Weather and special-ability effects | Weather talk |
| 19-47, 471-472, 481-488 | Pre-match: lineups, formations, derby, neutral ground, possession, style of play, team profile | Pre-match build-up |
| 30-39, 464 | Venue and spectators with weather; 464 = exact attendance (ObjectPlayerId) | Atmosphere lines |
| 450-470, 478-480, 496-497 | Stakes: league title, relegation, cup run | Context talking points |
| 800-822 | Stories: streaks, birthdays, families, previous match | Colour talking points |
| 460-463 | Fan reactions | Colour |
| 700-704 | Event-o-Matic manager quotes | Quote lines |
| 601-606 | Result and aftermath | Closing lines |
| 55-59, 71, 73 | Penalty contest | Highest tension |
| 880 | Assist end to a goal | Combine with the goal call |

Notes from the docs: SubjectTeamId is usually the team the event belongs to, SubjectPlayerId the main player, ObjectPlayerId the other player; exceptions exist (for example events 23, 24, 25, 27, 30-35, 40, 61, 64, 68, 75, 331-336, 451, 454, 456-458, 464-469).

## Open questions (TODO)
- How does the live `EventKey` string map to EventTypeID? Capture a fixture to see.
- Meaning of each `WeatherID`, `MatchTypeID`, `matchPart` (data types page).
- How early before kick-off is `matchdetails` data available, and what does it return during a live match?
- Is Hattrick consenting to automated live polling (licence 5.3, 5.4)? Record the decision in `docs/decisions/`.

## Reference: htlivesight (read locally, GPL v3, ideas only, no code copied)
- Product: Hattrick match viewer extension (Chrome MV3 manifest, also Firefox/Safari). The toolbar button opens an extension page in a tab; that page does the CHPP calls, shows matches and plays sound and speech. Host permission: `chpp.hattrick.org` only.
- Calls: `chppxml.ashx` with OAuth. `live` version 2.3 with `addMatch`, then `viewAll` once, then `viewNew` with `lastShownIndexes`. `matchdetails` 2.9 and `matchlineup` (older versions than the current 3.1 and 2.1).
- Polling: a 1-second timer drives a one-minute cycle. It fetches only when the time derived from `NextEventMinute` has passed. If that minute is above 45, it adds 15 to allow for the half-time break. Requests go through a single queue, one at a time.
- Sound: HTML5 audio with a volume slider; one clip per event type and per side (own, opponent, friend, other), including whistles (start, half time, end), boos for injuries and cards, and miss sounds.
- Weather: four one-shot clips (sun, few clouds, overcast, rain) played when the weather event arrives, not a continuous bed. Hattrick's weather has four states, which matches events 30 to 33.
- Speech: uses the browser's built-in speech synthesis (`speechSynthesis`) with a queue of event texts and a per-match on/off switch.
- Lesson for us: the extension-page-in-a-tab pattern avoids the MV3 service-worker audio problem, and a continuous weather bed would be a step beyond what it does.
