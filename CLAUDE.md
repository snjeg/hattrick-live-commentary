# Hattrick Live Commentary

Live, immersive football commentary for matches on hattrick.org: live match events and context data become a spoken, crowd-backed broadcast delivered through a browser extension.

## Status
MVP, pre-code. Current sprint is tracked in `docs/roadmap.md`. Do not start a sprint before the previous exit check passes. Do not build post-MVP features (commentator personalities, team bias, extra languages) until the MVP ships.

## Architecture (one line each)
- `packages/core`: pure logic (match model, script engine, scheduler, match clock). No network, audio or browser APIs.
- `packages/data`: adapters implementing `MatchSource` (CHPP client, replay simulator).
- `packages/audio`: `VoiceProvider` interface and adapters, crowd bed, event cues, ducking.
- `packages/server`: NOT in the MVP. Later, a thin proxy that holds voice and AI-writer keys (only after Hattrick consents to sending match text there).
- `packages/extension`: Chrome MV3 extension. Service worker holds session state only; audio plays from the offscreen document.

Data flow: CHPP (per-user session, directly from the extension) -> normalised Match/Event stream -> script engine (events + gap fillers) -> TTS + sound cues -> mixer -> listener.

## Hard rules
1. **Official data only.** Use the CHPP API. Never scrape hattrick.org pages, drive its UI, or use computer vision on it. The site's robots.txt disallows automated access to match pages and Hattrick bans unapproved apps. If a task seems to need scraping, stop and ask.
2. **No paid keys in the extension.** The MVP has no server, so the CHPP consumer secret ships in the extension (accepted, to be confirmed with Hattrick). Voice and AI-writer keys never go in the extension: they live on a later thin server.
3. **`core` stays pure.** No `fetch`, `window`, `chrome.*`, audio or file access in `packages/core`. Everything it needs comes in as arguments.
4. **Replay first.** Build and test against fixtures in `fixtures/` through the `replay` adapter. Live mode is the same `MatchSource` interface, nothing special-cased downstream.
5. **Never go silent.** The scheduler fills gaps between events from ranked talking points (form, standings, weather if available, head-to-head, manager, stadium, players). Silence over the configured limit is a bug.
6. **No immediate repetition.** Every line template has variants and a cooldown; the script engine tracks recently used lines.
7. **MV3 audio.** Service workers sleep and cannot play audio. Play from an offscreen document or a content script, and start only after a user click.
8. **Follow the CHPP Product License:** XML interface only, OAuth 1.0a, never ask for or store logins, share no Hattrick data with other services without consent, and write no automated live polling until Hattrick's written consent is recorded in `docs/decisions/`. **Do not guess CHPP fields.** Parse only fields present in saved fixtures or documented in `docs/chpp-findings.md`. Record unknowns there instead of assuming.
9. **Voice is pluggable.** All speech goes through the `VoiceProvider` interface; the on-device Web Speech adapter is only the default and will be replaced. No Web Speech calls outside that adapter. Scripts carry speaker, mood and intensity so a better voice improves the same script without rewrites. Line writing goes through a `LineWriter` interface too (templates first, AI-written later).
10. **Two commentators.** Every line has a speaker (`lead` for play-by-play, `analyst` for tactics, context and background). One voice at a time, the lead has priority, lines are short, interruptible and carry an expiry time. One-commentator mode must also work. Never cut immersion or planned features because of TTS limits; degrade gracefully instead.

## Domain notes
- A match is 90 minutes plus injury time, with possible extra time. Events arrive every few minutes, so the broadcast is mostly filler plus reactions.
- Crowd audio reacts to an event the moment it is parsed; spoken lines may follow shortly after.
- Match-clock time and wall-clock time differ; `core/clock` owns the mapping and drift correction.
- Live flow (`live` 2.3): `addMatch`, `viewAll` once, then `viewNew` with `lastShownIndexes`. Poll only when `NextEventMinute` is due. `NextEventMinute` and `NextEventMatchPart` are for the app only: never speak, show or hint at them.
- `matchdetails` 3.1 gives pre-match context (arena, `WeatherID`, referee, formations, tactics, match type). Its ratings, chances, possession, scorers, bookings, injuries and `AddedMinutes` are final-result data: never use them while a match is live, to avoid spoilers.
- `SubjectTeamID`, `SubjectPlayerID` and `ObjectPlayerID` are unsupported: take player names from the starting lineup and `EventText`, and degrade gracefully when an ID does not resolve.

## Conventions
- TypeScript strict mode, pnpm workspaces, Vitest for tests, ESLint + Prettier.
- Dates and times as ISO strings or epoch ms at module boundaries; minutes of play as integers.
- Line model: `{ speaker, text, mood, intensity, priority, interruptible, expiresAt, cue }`. Play-by-play calls the action (who, where, what); the analyst explains how and why.
- Every new event type needs: a model type, a parser test from a fixture, at least 3 line variants, and a sound cue mapping.
- Write an ADR in `docs/decisions/` for any decision that changes a hard rule or the architecture.
- Keep commits small; one sprint task per commit.

## Commands
```
pnpm install
pnpm test                          # all packages
pnpm --filter core test            # one package
pnpm tsx scripts/replay.ts <matchId> --speed 10   # print script for a fixture
pnpm tsx scripts/capture-fixture.ts <matchId>     # save a finished match
```
(Commands are placeholders until Sprint 0 and 1 create them; update this section as they land.)

## Working agreement
- Ask before adding a new runtime dependency or a paid external service.
- Before coding a sprint, restate its exit check and the plan in a few lines.
- Never commit API keys, `.env`, or raw data that is not a fixture.
- Sound assets must be licence-clear; note the source in `assets/sounds/README.md`.
- Do not use clips from htlivesight (no stated licence) without written permission, and do not copy its code (GPL v3). Treat it as a design reference only.
- Soundscape layers: continuous bed (crowd + weather ambience from `WeatherID`), event cues, then voice. Weather meanings come from the data types page; do not guess IDs.
- MVP speech is on-device TTS only (local voices, no network voices), so no Hattrick data goes to outside services until Hattrick consents. Expressive voices replace it later through `VoiceProvider`.
