# CHPP `live` v2.3 findings from real data (2026-11-06)

Source: real responses fetched by the owner. Treat as ground truth over assumptions elsewhere.

## Request parameters we always use
- `file=live&version=2.3&actionType=viewAll&useLiveEventsAndTexts=true&includeStartingLineup=true`
- `useLiveEventsAndTexts=true` returns the lively commentary style (multi-line build-ups, text for events that are otherwise empty). Default (false) returns report-style text with many empty EventText values. The parser must handle both modes.
- `addMatch` needs `sourceSystem=htointegrated` (tournament) or `youth`; the default is senior Hattrick. `matchdetails` also needs `sourceSystem=HTOIntegrated` for tournament IDs, otherwise it returns an unrelated senior match with the same number. `matchdetails` returns no events unless `matchEvents=true`.

## Text handling
- EventText is HTML. Lines inside one event are separated by `<br/>` (also `<br />`, `<BR>`). In live mode each line is one dramatic beat: speak them one at a time with short pauses; do not read as one blob.
- Strip tags and decode entities (`&amp;#245;` style double-encoded numeric entities appear in title attributes). `<span class="hometeam|awayteam">` marks team names, `<a ... class="homeplayer|awayplayer">` marks players.
- Old matches contain `[Replacement Error: Context 'formation' not found]` and sometimes a lone `<br/>`. Clean or drop.
- Scores in text may use a hyphen ("1 - 2") or an en dash ("1 – 2").

## Event structure
- EventKey = `<EventTypeID>_<variant>`. Index has gaps. Minute can be negative (-3 to -1) for pre-match events, MatchPart 0.
- MatchPart: 0 pre-match, 1 first half, 2 second half, 3 extra time, 4 shoot-out. Stoppage time uses minutes 91 and up with MatchPart 2.
- HomeGoals/AwayGoals exist only at match level. Derive the running score from goal events (or parse it from text).
- Upcoming own matches appear with an empty EventList.

## Event families seen
- Weather (minute 0): 30-33 real stadium (30 rain, 31 cloudy, 32 fair, 33 sunny; SubjectPlayerID stadium id, ObjectPlayerID attendance), 36-39 tournament/neutral (36 rain, 37 cloudy, 39 sunny; 38 not seen). Effect events: 390_x rain, 391_x sun/heat.
- Formations: ObjectPlayerID/SubjectPlayerID codes like 1030502 = 3-5-2 (1 + defenders(2 digits) + midfielders + attackers). In key 24, Subject = home formation, Object = away formation. Also seen in 20, 23, 481, 335.
- Pre-match: 19 (entering field), 21 (lineups), 28 (manager absent), 703 (fan fireworks), 811 (head-to-head history), 804 (recent form), 25 (derby), 598 (kick-off).
- During: 597 (second half), 471 (possession comment), 464 (crowd figure in ObjectPlayerID), 61/64/65 (organisation drops/recovers), 332/334/335 (tactic announcements), 75 (stoppage time announced), 70 (extra time), 71 (shoot-out).
- Chances/goals: keys 100-299 families (e.g. 121-134 goals, 17x-18x goals, 2xx misses/saves). 234 penalty miss, 134 penalty goal.
- Cards: 510 yellow, 511 booked for minor offence, 512 second yellow and dismissal, 514 straight red.
- Injuries: 401 injury, 424 replacement, 454 doctor verdict (ObjectPlayerID looks like weeks, unconfirmed).
- Penalty shoot-out: 56 scored, 58 miss wide, 59 saved/missed.
- End: 45 halftime, 599 full time, 601 winner celebration (SubjectTeamID = winner), 604 draw (team 0), 40 possession, 41/42 best/worst players, 550 end-of-match stats (always empty text, small numbers in player fields, meaning unknown).

## Lineup data (includeStartingLineup=true)
- Players with RoleID: 100 keeper, 101-105 defence, 106-110 midfield, 111-113 attack, 18 = set-piece taker (extra row). Behaviour 0-4 (meaning unconfirmed).
- `Substitutions` element: TeamID, SubjectPlayerID (out), ObjectPlayerID (in), OrderType, NewPositionId, NewPositionBehaviour, MatchMinute.

## Open questions
- Meaning of 550 values, Behaviour codes, whether 38 is "fair" tournament weather, injury ObjectPlayerID, SubjectTeamID 17417 on stadium events (likely attendance duplicated).
- Hattrick's stance on live polling frequency and use of the text for speech: no reply yet.
