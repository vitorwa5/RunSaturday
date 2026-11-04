# Release candidate product readiness matrix

Prepared 2026-11-03 by the independent QA agent. This is a planned evidence map, not a claim of passing execution or permission to merge/deploy. The coordinator owns the single PostgreSQL/browser lane and will record exact source/artifact heads and raw logs. New tests here are QA-authored fixtures, with application review and security disposition separate.

| Surface | Required observable behavior | Existing complete coverage plus new regression evidence |
| --- | --- | --- |
| Home / Saturday recommendations | Explained ranking, preserved intent/filter/date/travel, honest no-match and unavailable personal evidence | `e2e/app.spec.ts` Home/Saturday/orchestration; beta onboarding empty catalogue; new mobile surface and keyboard matrix |
| Explore / Challenges | Search, visits and missing-letter drilldown use recorded trusted events; no invented challenge credit from unmodelled CSV rows | `e2e/app.spec.ts` Explore/Challenges flows; history planner API tests; new search-focus regression |
| PB Finder | Filtered ranking and course/PB explanations, honest absent scores | Existing PB/course-score cases; real beta catalogue-only event case; new mobile landmark/label matrix |
| Where Could I Place? | Explicit time/source, historical placement and raw/course-adjustment caveats; missing evidence stays unavailable | Existing placement/current-form cases and API suites; beta empty-profile checks; new mobile matrix |
| Hidden Gems | Explain mode/results and empty choices honestly | Existing Hidden Gems and orchestrator cases; new mobile matrix |
| Compare | 2–4 events, source/time semantics, missing-event recovery and labelled removal | Existing comparison/current-form cases; new labelled-controls and overflow matrix |
| Event Details | Facts/provenance, historical data windows, scores when available, clear catalogue-only and reserved features | Existing event/analytics cases and real synthetic imported catalogue case in `e2e/auth.spec.ts`; new mobile matrix |
| Map / saved-event actions | Reserved features stay explicitly unavailable; no pretend integration | Existing navigation/reserved states; new keyboard Map navigation |
| Auth / private history / CSV | Cookie-derived owner plus originating-session binding; no stale-account dispatch/download; idempotent import/withdrawal and privacy | Complete CENTRAL/B4/H1 API/browser suites; unchanged baseline; new real built-worker offline CSV/account replacement case |
| Offline / reconnect | Static shell works from a real generated controlling SW; private UI hides offline; authoritative retry/reconnect before personal access | New standalone `e2e-pwa-readiness/offlineRelease.spec.ts`; no successful auth/API response mocked |
| Failed session bootstrap | No false authenticated success when refresh handles network failure; genuine retry restores current session | New built-artifact failed-network bootstrap case; existing auth lifecycle unit regressions |
| Install metadata | Name/start/scope/standalone manifest, real correctly sized PNG icons including maskable, Apple icon | New built-artifact install test; installation prompts/OS acceptance remain device validation |
| Mobile accessibility | 360/390/430 widths; named controls/navigation, current tab, no horizontal page overflow, skip link, route/back main focus, search retains focus | New `e2e/releaseReadiness.spec.ts` plus existing complete suites; automated checks supplement manual assistive-technology/device validation |

The deterministic DEMO suite uses explicitly fictional data and must display the DEMO DATA strip. Beta suites use disposable synthetic authorized fixtures, verified email sessions and the real database/API; they must not fill missing catalogue/results/personal evidence from seeded DEMO rows. Passing synthetic fixtures does not establish a license or authorization to ingest real event/results data.

Standalone built PWA command for the coordinator after building this candidate and checking PostgreSQL readiness:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first B4_API_ROOT=/absolute/candidate B4_NEW_WEB_DIST=/absolute/candidate/apps/web/dist B4_OLD_WEB_DIST=/absolute/distinct-old/apps/web/dist npx playwright test --config playwright.pwa-readiness.config.ts
```

The config reuses the reviewed controlled-host artifact fixture and real API proxy, requires explicit candidate paths, refuses system Chromium overrides, and runs serially. It performs no build, dependency installation or database migration/reset. Each synthetic case removes only its own UUID-namespaced records. Cache tests inspect actual CacheStorage after real worker navigation; no API/private caching is allowed. Hosting/CDN cache policy, private staging protections, real-device installation, email delivery, data rights and owner release authorization remain separate requirements.
