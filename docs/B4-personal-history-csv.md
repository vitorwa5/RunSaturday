# B4 — Private Personal History CSV v1

Import my 5K history accepts a user-prepared file, not an official parkrun export or connector. Upload only your own run history, never full event result tables or other people's data. The recorded history may be incomplete; Overall 5K PB continues to mean the fastest recorded 5000 m performance in 5K Compass.

## CSV contract

Required headers: `date,event_name,time`. Optional: `position,distance_m`. Unknown and duplicate headers are rejected. Standard quoted cells, embedded commas, LF/CRLF and UTF-8 BOM are supported using Papa Parse. File limit: 5 MiB, checked before reading; maximum 5,000 data rows, enforced again by the API. No MIME-type trust is required.

- `date`: real calendar date in YYYY-MM-DD, from 1950 through today; no ambiguous dates.
- `event_name`: 2–100 characters after NFKC, trimming and whitespace collapse; no control characters. Names are display text, never HTML or code.
- `time`: positive MM:SS (1–3 minute digits) or H:MM:SS (1–2 hour digits); seconds and hour-format minutes 00–59. Decimal minutes are rejected. The existing recorded-performance bounds (12 minutes through 9:59:59) are reused.
- `position`: optional positive safe integer, validated and displayed in preview **only**. The existing personal model has no position field; it is not persisted or used in analytics.
- `distance_m`: blank defaults to 5000; only the exact value 5000 is supported. Non-5K rows are invalid, never converted.

Illustrative template (names are not asserted catalogue matches):

```csv
date,event_name,time,position,distance_m
2026-09-05,Example Saturday 5K,24:31,87,5000
2026-09-12,"Example Park, West",23:58,,5000
```

A template download is generated from this fixed synthetic content. No uploaded cells are included in a spreadsheet download; uploaded formula-like cells are treated only as text.

## Privacy and API

File selection → local browser parsing → normalised run rows → authenticated server preview → explicit confirmation → private UserPerformance. Raw CSV, file name/path, athlete identity, A-number, email and DOB are neither requested nor stored by this feature. No browser persistent storage is used. Unsupported identifying headers are rejected. Raw text exists transiently while parsing; only preview candidates are retained in component memory.

`POST /api/profile/history-import/preview` accepts `{rows,sessionBinding}` and performs zero writes. `POST /api/profile/history-import/commit` accepts `{rows,sessionBinding,confirmation:"IMPORT MY OWN HISTORY"}`. Both strictly validate the body/query and independently limit row count. Each candidate contains a row number, date, eventName, time, optional position/distance strings, and optional eventId choice. Bodies are capped at 2 MiB. In beta, `sessionBinding` is required and must equal the SHA-256 fingerprint of the validated session ID returned by `/api/account/session`. Missing or mismatched bindings return `409 session_changed` before any history reads/writes. The fingerprint is a precondition, not an authentication credential or an account selector. No user selector exists: identity comes only from the validated request context. Commit never trusts a preview token/status/hash.

Local preview state is disposed with the authenticated component tree. File reads, preview responses, commit responses and withdrawal results check AuthEpoch tickets and component lifetime. Preview, commit and withdrawal send the binding captured from the rendered authenticated view; a session mismatch locks the personal UI and discards the file. This protects stale tabs even when BroadcastChannel notifications have not arrived. API requests use the existing abort signal; stale responses and 401s cannot apply state to another account.

## Mapping and private facts

Exact case-insensitive normalised names suggest a mapping only when unique in the trusted catalogue scope. Ambiguous names default to external, and the user can select a listed exact candidate or keep external at name level. Options distinguish town/region or internal identity. No fuzzy matches or new Events are created. Beta excludes DEMO and legacy IMPORTED rows without provenance. Trusted inactive Events may map for historical visits, but remain outside active recommendations.

Unmatched rows remain valid private external performances, with no trusted visit/Alphabet credit and no course adjustment source. Mapped rows can affect personal visit/challenge credit. All new imports use `source=CSV`, `verified=false` and `performanceType=OTHER_RACE`: the CSV does not certify an event type. The existing edit form lets the user explicitly correct the type. Reimport reapplies CSV v1 values/type.

## Replay, conflicts and atomicity

Server-generated CSV identity is SHA-256 of date, normalised original name (case-insensitive) and 5000 m; finish time and internal Event mapping are excluded. Replay without an explicit mapping choice preserves the saved mapping, including keeping external; a renamed catalogue event does not retarget the row. A saved mapping no longer in the trusted scope must be explicitly resolved before that row can be imported again. Same identity/values (including date and distance) → UNCHANGED; reimport restores a manually edited date on the original record, unless another record occupies the destination, which remains a CONFLICT; changed time or mapping → UPDATE to the same CSV record. Position changes have no persisted effect. Both records with duplicate logical identity inside a file are CONFLICT. Renaming the original event text changes identity; destination duplicate constraints still prevent silently replacing another record.

Non-CSV source collisions are CONFLICT, skipped by default. Destination identity and matching date/name/distance are checked to avoid bypass through external/internal mapping. No MANUAL, GARMIN, STRAVA or PARKRUN_API record is overwritten. Unknown mappings are INVALID.

Confirmation explicitly imports valid NEW/UPDATE rows together and skips invalid/conflicting rows. Commit recalculates classification inside the existing user-row lock/transaction. Canonical writes, one performanceRevision increment and historical RunnerFormSnapshot invalidation are atomic. A database failure rolls back the batch. Runner Form is recomputed afterwards; if this fails, the API reports `formStatus=deferred` while honestly retaining committed facts and invalidated snapshots. One run does not waive Form support/factor requirements.

There are no writes to Event, CatalogueImportRun, EventOccurrence, Result, EventScore or CourseFactorSnapshot. CSV is never shared/public analytical evidence.

## Removal and export

Imported CSV performances may be edited/deleted individually through the existing performance UI. `DELETE /api/profile/history-import`, with the current `sessionBinding` and confirmation `REMOVE MY CSV HISTORY`, removes only the current user's CSV rows, using the same revision/invalidation transaction. Other sources, settings, onboarding and shared catalogue remain. Bulk withdrawal has no batch model.

Account export includes these recorded facts with `source=csv`, `externalResultId` and `verified=false`; no original CSV exists to export. Account deletion removes them through the existing User cascade. This phase introduces no migration, upstream access, scraping, postcode resolver, public-results ingestion or analytical formula changes.

## Verification record — 2026-10-14

- Shared: 82 passed. Web: 72 passed, including delayed AuthEpoch preview rejection.
- Full relevant API/PostgreSQL regression: 463 passed in 35 files; unchanged migration suites excluded because no migration/schema changed.
- Final mapping-replay correction: 28 targeted API/auth/planner tests passed; shared/web, typecheck and both production builds passed again.
- Auth/B3/B4 Playwright: 30 passed at 360/390/430 px. After the mapping-replay correction, all 9 affected B4 browser scenarios passed again.
- Relevant DEMO Playwright: 108 passed at 360/390/430 px (personal history, Runner Form, Explore/Challenges, Saturday, Home, PB Finder and WCIP).
- PostgreSQL tests cover read-only preview, ownership with two populated accounts, exact replay, time correction, external-to-trusted mapping with stable ID, non-CSV source collisions, concurrency, second-write rollback, deferred derivation, trusted inactive visits, invalid DEMO/legacy mappings, export and scoped withdrawal.
- Browser tests inspect normalised request bodies and persisted private rows, support mixed valid/invalid files, confirm mappings, preserve manual data on withdrawal, and delay actual A preview/commit responses across A→B.

Self-review fixed mapping replay so previously confirmed choices are preserved; time validation reuses existing performance bounds. No analytical mathematics or public-data writers changed. Known pre-existing LOW items (auth request deadline under Web Lock and catalogue stat/read TOCTOU) remain outside B4.
