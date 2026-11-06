# 0001: No server in the MVP

Status: accepted.

Decision: the MVP runs entirely in the user's browser. The extension talks to CHPP directly for its own user. The CHPP consumer secret ships in the extension (to be confirmed with Hattrick).

Why: fits the per-user licence model, avoids sharing Hattrick data with other services (licence 5.2), and avoids hosting cost. A CHPP extension without its own server already exists (htlivesight).

Later: a thin server that holds voice and AI-writer keys, added only after Hattrick consents to sending match text there. The `VoiceProvider` and `LineWriter` interfaces keep that change small.
