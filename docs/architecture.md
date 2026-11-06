# Architecture

Three pillars, one direction of flow: data, script, audio.

CHPP (per-user session, directly from the extension) -> normalised Match/Event stream -> script engine (event lines plus gap fillers, two commentators) -> VoiceProvider + sound cues -> mixer -> listener.

- `packages/core`: pure logic (model, script engine, scheduler, clock). No network, audio or browser APIs.
- `packages/data`: `MatchSource` adapters: CHPP client and replay simulator.
- `packages/audio`: `VoiceProvider` interface and adapters, crowd and weather beds, event cues, ducking.
- `packages/extension`: MV3 extension. The toolbar button opens an extension page in a tab; that page polls, speaks and mixes. The service worker holds no audio.
- `packages/server`: not in the MVP. Later, a thin proxy for voice and AI keys.

Key ideas
- Replay first: everything is built and tested on fixtures; live is just another `MatchSource`.
- Expression lives in the script (speaker, mood, intensity), not in the voice engine, so voices can be replaced without rewrites.
- One floor: one voice at a time, the lead commentator has priority, the analyst yields, lines expire.
- Poll only when `NextEventMinute` is due; never speak or show that value.
- Context facts come from documented CHPP XML files only, fetched once per team and cached.
