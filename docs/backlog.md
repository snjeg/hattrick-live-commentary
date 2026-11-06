# Backlog (one task = one branch = one pull request)

Rules for every task: read `CLAUDE.md` first; touch only the package named in the task; write tests; do not edit another task's files; open a pull request with a short summary and the exit check result. Until real fixtures exist, use hand-written sample XML based on `docs/chpp-findings.md`, marked as synthetic in `fixtures/samples/`.

## Wave 0 (must merge first)
- **T1 Monorepo scaffold.** pnpm workspaces, TypeScript strict, Vitest, ESLint, Prettier, GitHub Actions test workflow, folder layout from `CLAUDE.md`. Exit: `pnpm test` passes in CI on an empty test per package.

## Wave 1 (parallel, after T1)
- **T2 Match model** (`packages/core/src/model`). Types for Match, Event, Team, Player, ContextFact; EventTypeID table and groups from `docs/chpp-findings.md`. Exit: types compile; table has tests for the +100 goal/miss mirror rule.
- **T3 CHPP parsers** (`packages/data/src/chpp`). Parse `live` 2.3 and `matchdetails` 3.1 XML into the model; ignore unsupported ID fields safely; final-result fields flagged as spoilers. Exit: parser tests on synthetic samples.
- **T4 Replay simulator** (`packages/data/src/replay`). Implements `MatchSource`; replays a fixture at 1x or 10x with `NextEventMinute`-style timing. Exit: deterministic replay test.
- **T5 Match clock** (`packages/core/src/clock`). Match minute to wall-clock mapping, half-time break, added time, drift correction. Exit: unit tests.
- **T6 Voice interface** (`packages/audio/src/voice`). `VoiceProvider` interface, mood and intensity mapping, Web Speech adapter (local voices only), test double. Exit: adapter tests with a mocked `speechSynthesis`.
- **T7 Mixer** (`packages/audio/src/mixer`). Web Audio graph: crowd bed, weather bed, event cues, ducking under voices; placeholder generated tones, no sound files yet. Exit: unit tests on gain logic.
- **T8 Extension shell** (`packages/extension`). MV3 manifest, toolbar button opens an extension page in a tab, start/stop UI, no CHPP code yet. Exit: loads unpacked; build test.

## Wave 2 (after T2, T5, T6)
- **T9 Line templates** (`packages/core/src/script`). Lead and analyst templates with variants, mood tags, expiry; start with goals, misses, cards, injuries, kick-off, full time. Exit: every covered event type has at least 3 variants per role.
- **T10 Talking points** (`packages/core/src/script`). Gap-filler facts from context (weather, arena, standings, form, manager, players) ranked by relevance and cooldown. Exit: tests for ranking and no immediate repeats.
- **T11 Scheduler** (`packages/core/src/script`). One-floor, two-voice scheduler: lead priority, analyst yields, expiry, gap filling. Exit: simulated 90-minute run with no silence over the limit and correct turn-taking.

## Human-only or blocked
- Licence approval and Hattrick's consent for live polling (`docs/decisions/0003`).
- CHPP consumer key and OAuth flow (needs the licence).
- Capturing real fixtures with the documentation's Example tab.
- Choosing sound clips and checking their licences.
- Listening tests of voices and atmosphere.
