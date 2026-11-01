# B4 import repair — independent review brief

## Inspected references

- Repository: `vitorwa5/RunSaturday` (5K Compass).
- Current main: `99165a0eb5e220d0213189708eb4ad94b6945239`.
- B4: `feat/b4-personal-history-csv-import`, `1fd215c2c3bcae0f7d039a6b6d9c98dbc245c3e6`, one commit ahead of main.
- Repair branch: `fix/b4-history-session-reimport`, based on B4. Review the repair against B4 to isolate these fixes.

## Root causes and minimal implementation

**HIGH — cross-tab session binding.** AuthEpoch invalidates responses when a tab learns about an account change. It cannot guarantee that a shared cookie still belongs to the account whose local rows or withdrawal confirmation are being submitted. A stale tab can send A's request with B's cookie before BroadcastChannel/focus handling catches up. Existing browser tests delayed responses after the server had already authenticated A; they did not cover a changed cookie before server authentication. Preview could classify against B's private history, commit could insert A's rows into B, and withdrawal could delete B's CSV rows.

The authenticated session response now includes a domain-separated SHA-256 fingerprint of the internal session ID. This is neither the cookie token nor a raw internal session ID. Preview, commit and withdrawal carry the fingerprint captured from their authenticated view. The API compares it with the fingerprint from its independently authenticated request context before any history read or write. Missing, stale, cross-account and replaced same-account bindings fail with `409 session_changed`. A binding never selects an owner or authenticates a request. Existing authentication, origin checks, transactional ownership filters and response tickets remain authoritative. The client locks and clears personal UI on rejection, with abort checks before handling delayed error bodies.

**MEDIUM — manually edited dates on reimport.** The stored CSV identity retains the original date, so replay finds the same record after a manual date edit. The planner's equality comparison omitted date and distance, incorrectly returning UNCHANGED. Comparing both fields makes replay UPDATE the original record and restore CSV values. Existing destination collision checks run first, preserving other records and sources.

No schema, UserPerformance DTO, public analytics, import identity format or provider integration changes are required.

## Modified files

| File | Purpose |
| --- | --- |
| `apps/api/src/auth/http.ts` | Derive the non-secret binding from validated sessions. |
| `apps/api/src/http/context.ts` | Type the binding in request-local session context. |
| `apps/api/src/history/routes.ts` | Reject mismatched history session preconditions before storage access. |
| `apps/api/src/history/planner.ts` | Compare persisted date and distance during replay. |
| `apps/web/src/auth/AuthProvider.tsx` | Carry the session binding in authenticated state. |
| `apps/web/src/api/endpoints.ts` | Include bindings in all history requests. |
| `apps/web/src/api/client.ts` | Clear stale personal UI on session mismatch; ignore aborted error bodies. |
| `apps/web/src/hooks/queries.ts` | Capture bindings for commit and withdrawal mutations. |
| `apps/web/src/pages/HistoryImportPage.tsx` | Bind preview to its authenticated view. |
| `apps/api/src/__tests__/auth.test.ts` | PostgreSQL binding rejection, replaced sessions, zero storage calls, preserved B data and manual-date restoration. Update existing fixtures for the new API contract. |
| `apps/api/src/__tests__/historyPlanner.test.ts` | Date restoration with stable record identity and safe destination conflicts. |
| `apps/web/src/__tests__/clientAbort.test.ts` | Session rejection locks UI; aborted error-body decoding cannot lock a newer session. |
| `apps/web/src/__tests__/historyLifecycle.test.tsx` | Preview carries the original session binding and delayed responses remain discarded. |
| `e2e/historyImport.spec.ts` | Real same-context cross-tab cookie changes with notifications suppressed, for preview/commit/withdrawal at three widths; manual-date correction and replay. |
| `docs/B4-personal-history-csv.md` | Updated session precondition and replay contract. |
| `docs/B4-import-repair-review.md` | Review scope, evidence and remaining risks. |

## Validation

Executed on 2026-11-01:

| Check | Command | Result |
| --- | --- | --- |
| Relevant API/PostgreSQL Vitest | `npm test -w @runsaturday/api -- --maxWorkers=1 --exclude '**/prismaStore.test.ts' --exclude '**/*Migration*.test.ts'` | **445 passed**, 34 files. Includes all new API/planner regressions. |
| Web Vitest | `npm test -w @runsaturday/web -- --maxWorkers=1` | **74 passed**, 10 files. |
| Shared Vitest | `npm test -w @runsaturday/shared -- --maxWorkers=1` | **82 passed**, 6 files. |
| TypeScript | `npm run typecheck` | **Passed**, all three workspaces, repeated after final test edits. |
| Production builds | `npm run build` | **Passed**, API and web; large-chunk advisory only. |
| Authenticated Playwright | `NODE_OPTIONS=--dns-result-order=ipv4first npm run test:e2e:auth` | **39 passed** at 360/390/430 px, including all 18 B4 cases; final sequential run completed successfully. |
| Whitespace | `git diff --check` | **Passed**. |

Prisma commands used `XDG_CACHE_HOME=/tmp/runsaturday-cache`; this only selects a writable local tool cache.

Environment preparation used the existing `npm run db:up`; Docker reported PostgreSQL healthy. The supplied `TEST_DATABASE_URL` targets local `localhost:5432/runsaturday`. Four existing migrations were missing and were applied with `DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy -w @runsaturday/api`. No new migration was authored. Package installation used temporary npm and XDG caches because the default caches were outside the writable sandbox. Browser runs used IPv4-first DNS, the configured `PLAYWRIGHT_BROWSERS_PATH`, and Playwright's pinned Chromium without an executable override.

Earlier attempts are not passing evidence: the initial broad API run encountered missing migrations, seeded DEMO fixture failures and timeouts and was stopped; the initial browser startup timed out before migrations were applied. A later overlapping API/browser run caused one public-catalogue-count assertion failure and a watched API restart during one B1 browser case (38/39 browser cases passed, including all 18 B4 cases). Final API and browser validation is sequential to avoid those shared-resource conflicts. No full API-suite pass is claimed.

## Remaining risks and review focus

- Beta history clients must send the current binding. An older cached client fails closed and must reload; coordinate frontend/backend release when separately deployed.
- This guard covers the three B4 history endpoints. Other personal mutation endpoints retain their existing protections and were not expanded in this repair.
- A request authenticated before logout may finish for that original authenticated owner. It cannot be retargeted to a replacement cookie's owner.
- Editing the date inside the CSV changes its logical identity; the repair specifically addresses edits to an already imported private record. No speculative matching or automatic reconciliation is added.
- Seeded DEMO-store and migration regression suites are outside the final relevant API run; they must not be described as passing. Build output includes the existing large-chunk advisory.
- Independent review should inspect the binding boundary and verify that reimport's restoration of CSV date/type is the intended product behavior. A destination occupied by another record remains a conflict.

Only local synthetic test fixtures were written or cleaned up. No production data was accessed or modified, no scraping or parkrun API access occurred, and no merge or deployment was performed. Independent review remains outstanding.

Recommendation: **READY FOR REVIEW**. Independent review, merge and deployment remain separate steps.
