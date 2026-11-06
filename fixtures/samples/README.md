# Synthetic samples

Hand-written XML for parser tests where no real fixture exists yet. **Every file here is synthetic**: it imitates documented CHPP structure but is not data fetched from Hattrick. Prefer real fixtures in `fixtures/real/` whenever one covers the case, and replace these once real data is captured.

| File | Imitates | Why synthetic |
| --- | --- | --- |
| `live-viewall-reporttexts.synthetic.xml` | `live` 2.3 `viewAll` with `useLiveEventsAndTexts=false` (report-style texts, many empty) | No report-mode fixture captured yet |
| `live-viewnew-inprogress.synthetic.xml` | `live` 2.3 response for a match in progress, with `NextEventMinute`/`NextEventMatchPart` | Real fixture only has finished matches; element position assumed (see `docs/open-questions.md`) |
| `matchdetails.synthetic.xml` | `matchdetails` 3.1 with `Arena > WeatherID` and `AddedMinutes` only | No matchdetails fixture yet |
