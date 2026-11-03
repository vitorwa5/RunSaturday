# CENTRAL independent QA review

Review date: 2026-11-03. Assigned review checkout: `/workspace/RunSaturday-central-qa`. Application and executed fixtures inspected in `/workspace/RunSaturday-central`; raw executor evidence in `/workspace/RunSaturday-central-evidence`. This review concerns the CENTRAL repair after owner-authorized B4 merge `fc7ca19`; it grants no merge or deployment authorization.

## Scope and independence

Application implementation is `72b5c1c` plus failed-refresh authority correction `cdbbd04`. The final inspected execution head is `7e3da4597c74ed6a33be3ca2f8f6f3397b1c09fb`. All later changes through `a49cb0f` are tests or documentation; the final cached-gate adjustment `7e3da45` changes only one test assertion. This reviewer read actual application diffs and raw results rather than treating developer summaries as evidence. The coordinator owns the sole PostgreSQL/browser lane; this review did not install dependencies, start services, run a second database/browser suite, or change application code.

Earlier QA work in this checkout authored API/browser regressions and fixture changes (`77b7d2c`, `d1e812e`, `bfa6d15`, `70302a4`, `646ff4f`, integrated under different commit IDs). Those are authored QA fixtures, not independent review of their own implementation. This resumed review independently assessed the application, coordinator fixture repairs, final cached-gate correction and actual execution evidence. Security review remains a separate disposition.

## Application findings

The API identity hook validates the cookie session and real non-demo verified owner, then compares the supplied header against that session's derived binding before contextual handlers. A binding cannot select an owner. Missing/stale bindings fail with `409 session_changed`; private unauthenticated routes retain `401`. Login/logout also require an explicit originating intention, including `signed-out`. Narrow bootstrap/health/OTP-send/OPTIONS exemptions and existing origin enforcement remain. The response no-store header is set before rejection.

Rendered transport closures copy the originating user/session/expiry and share the existing authentication Web Lock. They revalidate `/account/session` after acquiring it. Dispatched operations hold the lock through response completion; cancellation discards obsolete results instead of releasing the lock while the server may still act. History methods avoid recursive acquisition because the existing H1 mutation/preview boundary already holds the same lock. Export and retained login/logout/delete callbacks receive equivalent protection. Failed session refresh clears the internal intention before showing signed-out UI. Missing Web Locks fail closed for these operations.

Read-only `git diff fc7ca19` checks found no changes to `apps/web/src/auth/historyOperation.ts`, `apps/api/src/history/`, Prisma schema/repositories, `packages/shared`, history page, or planner parameter implementation. H1 and M1 are preserved rather than replaced. The new header is additional to existing history-body binding. Shared algorithm and planner assertions remain exercised.

## Evidence reviewed

| Raw evidence | Independently observed result |
| --- | --- |
| `api.json` / `api.log` | success true; 474 total, 474 passed, 0 failed, 0 pending |
| API subsets | 4 CENTRAL, 6 history planner, 23 Prisma-store tests; both migration suites actually passed |
| `web.log` | 106 passed, 12 files |
| `shared.log` | 82 passed, 6 files |
| `typecheck.log` | all workspace TypeScript checks complete without errors |
| `build.log` | API/web production builds complete; generated PWA worker/precache; existing chunk-size advisory |
| `browser-first-failed.log` | complete default mobile suite: 189 passed in 4.9 minutes |
| `browser-auth-final.log` | complete authenticated suite: 117 passed in 4.8 minutes |
| `browser-cache-final.log` | real OLD-to-NEW service-worker upgrade: 1 passed in 8.2 seconds |

API source was exercised at `cdbbd04`; final web fixture repair `dfceb6b` changes tests only. General browser source remains unchanged; authenticated final tests include `efd4301` and `a49cb0f` fixture repairs. Authenticated evidence includes 57 CENTRAL cases across 360/390/430 widths: valid queued settings/manual add/edit/delete/export/account deletion/logout/contextual read against same-user and other-user replacement sessions, withheld-response lock retention, and no-Web-Locks export. Existing B4/H1 import and queued replacement tests also pass. Negative cases assert no contextual dispatch/download, unchanged database/session state and no replacement private data display. API cases assert handler spies untouched, unchanged data, OTP preservation and no Set-Cookie before accepting explicit bound positive controls.

Initial failures are preserved, not counted as passes: initial API 470 passed/4 failed positive fixtures without bindings; initial web 105 passed/1 failed pre-logout callback fixture; initial authenticated browser 93 passed/24 failed fixtures. Browser fixture fixes bind intentional direct API setup, await real completed operations, release withheld export before awaiting a lock-blocked transition, fill valid action inputs, and use an uncached contextual route. They retain no-download, no-private-flash, database and stale-action assertions.

## Cached-client gate assessment

The retained `browser-cache-first-failed.log` contains the initial cache failure: the exact required session/preview/session/commit sequence was followed by two extra `/api/account/session` requests after successful import. Source inspection confirms successful mutation invalidates contextual queries, whose new CENTRAL transports now check the authoritative session. The old exact-total-length assertion was obsolete.

The test-only correction `7e3da45` requires the first four entries exactly and permits only trailing session checks. It retains exactly two history bodies, originating body binding/no-userId assertions, unchanged old-client database/revision/snapshot assertions, real worker control/activation and asset hashes, second-account isolation, no API/private cache or URL leakage, and HttpOnly cookies. No extra history operation is allowed by the relaxed suffix. This correction is appropriate and does not require an application change.

Independently read the completed final raw cache log: **1 passed (8.2s)**, with one worker and no failures shown. Rechecked final source HEAD `7e3da4597c74ed6a33be3ca2f8f6f3397b1c09fb` and its single test-only diff from `a49cb0f`. The coordinator separately observed the actual rerun process exit 0. Historical `browser-final.exit` and `final-stage.exit` remain failed-attempt records and must not be presented as final success; the standalone rerun is separate evidence. The initial cache failure is retained under `browser-cache-first-failed.log` and its exit marker.

## Verdict

**APPROVE — technical QA for the focused CENTRAL repair at `7e3da4597c74ed6a33be3ca2f8f6f3397b1c09fb`.** No remaining application blocker was found in this review. Complete API/web/shared/typecheck/build, default mobile, authenticated mobile, and real cached-client upgrade evidence is green as described above. Initial failures and test-only repairs are disclosed. This is an integration-readiness recommendation subject to separate security disposition and owner authorization; it is not permission to merge or deploy. Recheck the actual refs if source changes.

## Limits

Controlled loopback old/new production artifacts and real generated workers validate cached-client compatibility, not production CDN/cache-header policy. Old clients need worker activation/reload for login and personal use. API-first or atomic compatible rollout, real hosting/email/data rights and live operational checks remain release work. Existing slow-response lock delays are an intentional consequence of retaining originating-session safety. No scraping, purchase, production data change, merge or deployment was performed or authorized by this review.
