# Open questions (need a human decision or real data)

Agents add items here when a task is blocked on something only the project owner can decide or fetch, then move on. Remove an item once it is answered, and record the answer where it belongs (`docs/decisions/`, `docs/chpp-findings.md`, or the code).

## Decisions
- **T12 secret handling (undecided).** How the CHPP consumer key and secret reach the extension build. Until decided, no key or secret is written to any file; code reads them from environment variables only and tests use fake values.

## Data we do not have yet
- **Goal side from EventTypeID.** `docs/chpp-findings.md` says home goals are 100-143 and away goals 150-184, but real data has 219 (the miss mirror of 119) for the away team. Special-event IDs appear to be shared by both sides. The model therefore does not derive the side from the ID; parsers use `SubjectTeamID` and then the `homeplayer`/`awayplayer`/`hometeam`/`awayteam` classes in the text. Confirm with more fixtures.
- **Event 75 added minutes.** `docs/chpp-findings.md` says `ObjectPlayerID` holds the added minutes, but the real fixture has 0 there and the number only in the text ("an additional 2 minutes"). Which is reliable?
