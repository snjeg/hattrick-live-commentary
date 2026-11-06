# Roadmap

Do not start a sprint before the previous exit check passes. Tasks per sprint are in `docs/backlog.md`.

| Sprint | Goal | Exit check |
| --- | --- | --- |
| 0. Feasibility | CHPP development licence and consent; real fixtures captured; weather and event-key mapping confirmed; two-voice and audio loop proven in an extension page | Findings written in `docs/chpp-findings.md`; a 60-second two-voice audio loop plays from a click |
| 1. Data core and replay | Normalised match model; live and matchdetails parsers; replay simulator at 1x and 10x | A saved match replays end to end with correct minutes and score |
| 2. Script engine | Event templates with variants, speaker roles (lead, analyst) and mood tags; gap-filler talking points; two-voice scheduler; match clock | A replayed match prints a full 90-minute script with no silence over the limit, no immediate repeats, correct turn-taking |
| 3. Voice and soundscape | `VoiceProvider` with on-device adapter and two voices; crowd bed, weather bed, event cues, ducking | A replayed match is a listenable broadcast in a browser page |
| 4. Live mode (extension only) | Per-user CHPP OAuth login; live polling driven by `NextEventMinute`; no server | A real live match of the developer's own team drives the broadcast |
| 5. Extension | MV3 extension: extension page in a tab, start button, volume and mute, settings, one-or-two commentators | Install unpacked, open a match, press Start, hear commentary |

After the MVP: expressive voices and a thin server for keys (with Hattrick's consent), AI-written lines through `LineWriter`, commentator personalities, team bias, more languages, store publishing.
