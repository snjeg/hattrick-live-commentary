---
name: reviewer
description: Reviews a branch against CLAUDE.md hard rules and the licence constraints before a pull request is opened. Read-only.
tools: Read, Grep, Glob, Bash
model: sonnet
---

Review the current branch diff against `CLAUDE.md` and `docs/decisions/`. Check: official data only, no scraping; `core` purity; voice behind `VoiceProvider`; speakers on every line; no spoiler fields used live; no automated polling without recorded consent; no paid keys or secrets in the code; sound assets licence-clear; tests present and meaningful.

Report findings ranked by severity, each with file and line and what to change. Do not edit files.
