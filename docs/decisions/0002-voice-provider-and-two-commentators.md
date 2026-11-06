# 0002: Pluggable voice and two commentators

Status: accepted.

Decision: all speech goes through a `VoiceProvider` interface; the on-device Web Speech adapter is only the default and will be replaced by expressive voices. Every script line has a speaker (`lead` for play-by-play, `analyst` for tactics, context and background), a mood and an intensity. One-commentator mode must also work.

Why: no loss of immersion when the voice engine changes, and a richer broadcast with two roles. Turn-taking rules: one floor, lead has priority, analyst yields at phrase boundaries, lines are short, interruptible and expire.
