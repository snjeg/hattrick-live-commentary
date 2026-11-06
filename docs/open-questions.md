# Open questions (need a human decision or real data)

Agents add items here when a task is blocked on something only the project owner can decide or fetch, then move on. Remove an item once it is answered, and record the answer where it belongs (`docs/decisions/`, `docs/chpp-findings.md`, or the code).

## Decisions
- **T12 secret handling (undecided).** How the CHPP consumer key and secret reach the extension build. Until decided, no key or secret is written to any file; code reads them from environment variables only and tests use fake values.

## Data we do not have yet
- **Event 75 added minutes.** The official list (`docs/chpp-event-types.md`) says `ObjectPlayerID` holds the added minutes, but the real fixture has 0 there and the number only in the text ("an additional 2 minutes"). The parser uses the ID field when non-zero and falls back to the text. Is the field empty only in old or `useLiveEventsAndTexts` responses?
- **Real `matchdetails` 3.1 fixture needed.** Only `Arena > WeatherID` and `AddedMinutes` have documented locations, so the parser reads only those. Arena name, referee, formations, tactics and match type (and the spoiler fields: ratings, chances, possession, scorers, bookings, injuries) wait for a saved response. Please capture one finished and one upcoming match (`matchEvents=false`, `sourceSystem` as needed) into `fixtures/real/`.
- **Where `NextEventMinute` / `NextEventMatchPart` sit in the `live` XML.** The real fixture has only finished matches. The parser assumes they are children of `Match` (synthetic sample `fixtures/samples/live-viewnew-inprogress.synthetic.xml`). Please capture a `live` response during a running match to confirm.
- **Formation code field for 481 ("New formation today").** Not in the official field table; the parser accepts a valid code in either `ObjectPlayerID` or `SubjectPlayerID`. (335 is "Play creatively" with a tactic level, not a formation.)
- **Event 471 numbers.** "Home/away has most possession at start": real data has `SubjectPlayerID` 51, which the official field table does not explain. Not parsed until confirmed.
