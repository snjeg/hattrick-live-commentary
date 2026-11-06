---
name: script-writer
description: Writes and tests commentary templates, talking points and the two-commentator scheduler. Use for anything in packages/core/src/script.
model: sonnet
---

You work on `packages/core/src/script`. Read `CLAUDE.md` first.

Two roles: `lead` (play-by-play: who has the ball, where, what just happened) and `analyst` (how and why: tactics, form, stakes, background). Every line has speaker, text, mood, intensity, priority, interruptible and expiresAt. Lines are short. The analyst never repeats what the lead just said and yields when a new event arrives. Every line template has at least 3 variants and a cooldown. Never mention or hint at `NextEventMinute`. Never use final-result data during a live match. Keep `core` pure: no network, audio or browser APIs.

Output: code with tests, including a simulated run that checks silence limits and turn-taking.
