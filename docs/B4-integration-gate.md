# Complete B4 integration gate

## Scope and immutable references

PR #4 remains `aa0a36c2f862afe2e9f441639768a9560941eeae`, targeting B4 `1fd215c2c3bcae0f7d039a6b6d9c98dbc245c3e6`. Remote refs were checked again on 2026-11-02; main is `99165a0eb5e220d0213189708eb4ad94b6945239`. No production application code changed after independently reviewed `8bb4fdf`: its four subsequent files are documentation only.

PR #6 (`integration/b4-to-main`) prepares complete B4 for main. It adds test fixtures and validation infrastructure without changing H1/M1. PR #4 is not rewritten. Read-only merge simulations establish clean ancestry/integration; no actual merge has occurred. Owner authorization is still required, first for PR #4 into B4, then for complete B4 into main.

## Full regression execution

Coordinator prepared the existing shared PostgreSQL service once and verified it healthy and accepting connections. Agents reviewed files/evidence independently; they did not start competing DB/browser runs or request duplicate setup. Supplied `TEST_DATABASE_URL`, one Vitest worker, pinned Playwright Chromium, no executable override, and command-local IPv4-first DNS were used. Only synthetic test records and owned temporary schemas were created/cleaned.

Full API command: `npm test -w @runsaturday/api -- --maxWorkers=1 --testTimeout=15000 --reporter=json --outputFile=/workspace/RunSaturday-b4-gate-evidence/api.json`. No exclusions. Result: 470 passed, zero failed/pending, 37 result files. This includes all 23 DEMO-store tests and both migration suites (one test each). The migration suites execute real migration deployment/status checks, including upgrade preservation. The DEMO parity fixture uses its own random schema inside the supplied test database, actual migrations and fixed-date synthetic analytics; existing parity assertions remain intact.

Full web: 86 passed. Full shared: 82 passed. All workspace TypeScript and API/web production builds passed. The old B4 production web artifact was built separately. Existing large web-chunk build advisory remains. Test-only fixture additions were followed by another successful all-workspace TypeScript check.

Browser command: `NODE_OPTIONS=--dns-result-order=ipv4first XDG_CACHE_HOME=/tmp/compass-b4-gate-cache npm run test:e2e:b4-gate`. It runs default, authenticated and cached-build suites sequentially. Initial live-clock default run: 162 passed, 27 failed (nine Current Form-dependent cases at three widths); later suites were not executed by that failed chain. The raw failure log was preserved. The synthetic dataset/request clock depended on today's weekday, while browser assertions expected the established Thursday reference fixture. A guarded test-only DEMO entrypoint now uses the existing injected clock with the reference date; numeric assertions and application algorithms are unchanged. Independent security reviewed this fixture. Final result: 189 default E2E passed (4.6 minutes), 60 authenticated passed (2.7 minutes), and one real cached-shell upgrade passed (6.4 seconds); process and recorded exit code are both zero. No final browser failures or skipped cases. The authenticated suite includes 39 B4/H1 cases and 21 B1/B3 cases across 360/390/430 px. Raw log digests are preserved in `B4-integration-validation.json`; independent QA/security dispositions are recorded separately.

## Compatibility and remaining boundaries

Old B4 assets against the new API must receive `409 session_changed` for unbound preview/commit/withdrawal, before history access. Session DTO fields remain compatible with existing clients. New assets against the old strict API are not a supported deployment order: deploy compatible API before or atomically with assets.

The real cached-build fixture uses distinct built old/new service workers and a loopback artifact host, not mocked history responses. It checks old-client rejection without changing protected records/revision, actual new worker activation and asset replacement, post-lock session revalidation, private import and account isolation, HttpOnly cookies, and absence of private API data in CacheStorage. Its controlled no-store host does not establish production CDN cache policy. Production hosting still needs HTML/service-worker revalidation and private API caching checks.

This gate concerns B4 integration, not production readiness. Wider non-B4 session-intention hardening remains a high-priority pre-existing production blocker; see `B4-next-release-workstream.md`. Licensed real event/results rights and live hosting/domain/email/operational checks remain external launch dependencies. No scraping, purchase, production data modification, merge or deployment occurred.
