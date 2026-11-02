# Independent complete B4 integration gate

Review date: 2026-11-02. Reviewer: independent QA agent, assigned checkout `/workspace/RunSaturday-qa`. Scope is integration of complete B4/B4.1 into main; this is not production or deployment approval.

## Exact targets and static evidence

- B4 baseline: `1fd215c`; reviewed application: `8bb4fdf`; exact PR4: `aa0a36c`.
- Independently executed `git diff --name-status 8bb4fdf..aa0a36c`: exactly four added documentation files, 221 lines; no application/configuration change.
- Independently executed ancestor checks: both `1fd215c` and `8bb4fdf` are ancestors of `aa0a36c`.
- Main resolved to `99165a0eb5e220d0213189708eb4ad94b6945239`. Independently executed `git merge-tree --write-tree origin/main aa0a36c`: exit 0, tree `3350755c892b20278c6578fc3e0db3c179945281`. No merge was performed.

## Test-only preparation independently reviewed

Gate preparation `4179361a01cf9922f032dec0339978059535e27f` adds only `apps/api/src/__tests__/fixtures/seededDemo.ts` and adapts `prismaStore.test.ts`. It uses a random disposable schema within supplied `TEST_DATABASE_URL`, applies the real migrations, constructs deterministic DEMO data at `2026-10-03`, refreshes real analytics, and disconnects/drops its own schema. Assertions remain intact. It does not reset/reseed shared public fixtures or change application code. Approved for the final complete suite.

The separate old-client compatibility fixture at `7c4f19372a73ca8e630bbee7f6bd17d67ddad721` (`playwright.b4-cache.config.ts`, `e2e-b4-cache/upgrade.spec.ts`, `scripts/b4-cache-server.mjs`) was independently read before execution. It serves real distinct old/new production artifacts and generated service workers on loopback, proxies the real new API preserving browser Origin, and never mocks successful history responses. Assertions cover old SW-controlled navigation and asset SHA, unbound old preview/commit/withdrawal rejection with protected canonical data/revision unchanged, actual service-worker update/claim, new precache SHA and old asset removal, real Web Lock queue and session-check-before-bound-operation order, a second synthetic owner, no private API cache/URL leakage, and HttpOnly session cookies. Approved for execution. The cache upgrade case uses 390 px; regular complete browser suites supply 360/390/430 px coverage. Its new account may have no snapshots, so unchanged-snapshot comparison supplements existing full API invalidation coverage.

## Required complete runtime evidence

The coordinator owns the sole PostgreSQL/browser lane. Planned evidence includes database readiness; all API tests including migration and analytic parity suites with one worker and supplied test database; all shared and web tests with one worker; all workspace typechecks; current API/web production builds; old production web build; complete default plus authenticated Playwright suites; and the standalone real-cache upgrade scenario. No suite exclusions are approved by this review.

The independent reviewer resumed after executor interruption and directly parsed `/workspace/RunSaturday-b4-gate-evidence/api.json`, then read `api.log`, `web.log`, `shared.log`, `typecheck.log`, `build.log` and `old-web-build.log`. These are coordinator-executed commands, independently inspected rather than accepted from developer summaries.

| Evidence | Observed outcome |
| --- | --- |
| Complete API JSON | `success: true`; 470 total, 470 passed, zero failed, zero pending; 37 result files |
| `integrationMigrations.test.ts` | 1 passed |
| `onboardingMigration.test.ts` | 1 passed |
| `prismaStore.test.ts` | 23 passed, real disposable-schema DEMO parity |
| Complete web Vitest | 86 passed in 11 files |
| Complete shared Vitest | 82 passed in 6 files |
| Workspace TypeScript | shared, API and web commands complete without diagnostics |
| Current API/web production build | complete; generated API bundle and PWA service worker/precache |
| Old B4 production web build | complete; old module `index-DPJGvoDS.js` differs from current `index-DmHTA9G1.js` |

The API command uses one worker and a 15-second test timeout; no exclusions are present. API JSON confirms the optional database suites actually ran rather than reporting skipped. Both web builds emit the existing >500 kB chunk-size advisory, not a build failure. The build logs show generated PWA artifacts, not production deployment validation.

Rechecked `8bb4fdf..aa0a36c` and clean main-to-PR merge-tree after resumption. Gate head `423e842` contains only six test/tooling files relative to `aa0a36c`: isolated DEMO fixture and test adaptation, cached-build test/config/host, and the sequential gate npm script. No production application file changed.

The initial complete default browser run is preserved in `browser-live-clock-failed.log`: **162 passed, 27 failed**. Its nine Current Form-dependent tests failed at each of three mobile widths because the live November dataset/request clock yielded `20:01`, whereas the established Thursday fixture asserts `20:02`. This was not counted as a pass. The failed `&&` chain did not execute authenticated or cache-upgrade suites.

This QA reviewer authored the test-only fixture `2fca3c0`, integrated as `55fb273`: `apps/api/scripts/e2e-demo-server.ts` and `playwright.config.ts`. It uses the existing `buildApp({now})` and `MemoryDataStore('2026-10-01')` hooks, requires `NODE_ENV=test`, binds loopback, and refuses server reuse. No numeric assertion, production entrypoint, scoring algorithm, H1 or M1 implementation changed. The independent security reviewer statically approved this fixture; the coordinator executed it. This report does not claim independent QA authorship and review of the same fixture. `typecheck-final.log` was independently read and confirms all workspace TypeScript checks passed after the fixture change.

The reviewer independently read final `browser.log` and `browser.exit` (exact `0`), rather than relying on the coordinator's reported counts:

| Sequential browser suite | Actual result |
| --- | --- |
| Complete default mobile DEMO | **189 passed**, 4.6 minutes |
| Complete authenticated beta | **60 passed**, 2.7 minutes |
| Real OLD-to-NEW production service-worker upgrade | **1 passed**, 6.4 seconds |

The authenticated log contains 21 `historyImport.spec.ts` cases and 18 `historyLock.spec.ts` cases: **39 B4/H1**, including CSV replay/manual-date correction, withdrawal, delayed response, stale tab and queued same-account/other-account session replacement. The remaining 21 are 9 authentication and 12 onboarding cases. The default and authenticated suites cover widths 360/390/430. All three final suites ran sequentially with one worker and no failed/skipped cases shown. The cache test proves real old-client rejection and upgrade under its controlled no-store host, not production CDN freshness. Prior H1/M1 passes were not substituted for these complete runs.

The commands use command-local IPv4-first DNS. Pinned-browser/no-system-override selection is coordinator execution configuration; the reviewer did not launch a second browser. Browser transform-cache `sourcesContent` byte identity was independently verified by security to address transformed reporter line numbers.

Final exercised application source remains the reviewed PR4 code; gate source `55fb273` adds only test infrastructure and workstream documentation. `055219e` afterward adds only `docs/B4-integration-gate.md`. Independent read-only `git merge-tree --write-tree origin/main 055219e` succeeded (tree `8addf0fa1561287324961ab0d99adbdd3aa06716`); PR4-to-B4 clean simulation remains as above. No actual merge was performed.

## Verdict

**APPROVE — complete B4 integration scope**, including unchanged PR4 `aa0a36c` into B4 and prepared integration PR #6 (`integration/b4-to-main`) into main, subject to owner authorization and rechecking the actual refs if either branch changes. No new B4 application blocker was found by independent evidence review. H1/M1 were not reimplemented. The initial 27 browser failures are disclosed above and resolved through independently security-reviewed deterministic test infrastructure; the complete rerun is green.

Correct dependency order: owner-approved PR #4 → B4, then owner-approved complete B4 → main (prepared PR #6); recheck the resulting head/mergeability before each action. This is a technical QA recommendation, not a formal GitHub approval or permission to merge/deploy.

**Production remains blocked** by the pre-existing non-B4 session-intention gap and external launch prerequisites. The next engineering workstream must reconcile existing candidate CENTRAL hardening with H1 before introducing global private read/write binding; it must receive new independent QA/security and cached-client compatibility validation. API-first or atomic compatible rollout is required: upgraded assets against the old strict API are unsupported. Production cache headers/CDN behavior, authorized real data, hosting/domain/email credentials and live operational validation remain launch boundaries. No production approval, merge or deployment is granted.
