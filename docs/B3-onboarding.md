# B3: starting area and first use

Real accounts have explicit `User.onboardingCompletedAt`. Completion is independent of location and performance history, can be skipped, and never resets when either is removed. Demo fixtures are explicitly complete. The welcome journey asks for a temporary interest (React state only), optional starting area/travel budget, optional manual 5K, then a discovery CTA. The existing performance form accepts only the allowlisted `returnTo=onboarding` return; no duplicate performance logic exists. Profile/account controls remain accessible during onboarding, including logout, export and deletion. Only the Home entry redirects incomplete real accounts; other pages remain accessible.

## Approximate starting area

Reuse `homeLat`, `homeLon`, `homeLabel`, `defaultTravelMinutes`. There is no location history. Browser geolocation is requested only by tapping **Use my approximate location**. Permission denial, unavailable position, timeout and unsupported browsers leave label/skip available; there is no automatic retry.

Both coordinates are rounded to the nearest **0.05 degrees**, using `coarseCoordinate` in shared. Physical grid size varies with latitude: this is a privacy-oriented approximation, not a guaranteed radius or anonymity. The browser quantises before any API request; the server validates finite coordinates in latitude −90…90 / longitude −180…180 and quantises defensively before persistence. Precise device values are confined to the geolocation callback, never deliberately transmitted or logged. Saving/clearing creates no location history.

Town/postcode district input is a display label only. **No geocoder, postcode API, dataset or remote location resolver is included.** A label alone does not produce coordinates, nearby sorting or travel estimates. A future authorised resolver must preserve the coarse coordinate settings contract; it must be explicitly approved separately. The initial audience is UK-focused, while latitude/longitude and catalogue countries remain provider/country neutral.

`GET /api/profile/settings` and `PATCH /api/profile/settings` use validated request identity, with no user selector. PATCH accepts paired coordinates or paired nulls, nullable/trimmed label (100 characters), travel budget 15/30/45/60/90 (default 30), and one-way `completeOnboarding: true`. Unknown fields are rejected. Clearing sends null for both coordinates and label. Completion timestamp is set by the server once. Profile allows editing, clearing, and saving. Export includes saved coarse settings and completion; deleting User removes them naturally. Personal query keys include User.id and mutations use existing AuthEpoch cancellation.

## Travel and zero history

Travel remains the existing straight-line/road-factor heuristic, labelled approximate and **not live traffic or turn-by-turn routing**. Saved travel budget only filters when an origin exists. Without coordinates, Saturday/tools explicitly request starting-area setup; Explore and Challenges still work. API clients may use existing explicit coarse lat/lon request origins temporarily without persistence. Beta never falls back to the demo starting point or DEMO catalogue.

| Page/intent | Zero-history behaviour |
| --- | --- |
| Home | Explore, Challenges, Add 5K and starting-area CTAs; PB/Recent Best/Current Form not established |
| Explore / Challenges | Trusted active catalogue only; zero trusted visits/favourites; Alphabet 0/25 |
| Profile | Recorded facts empty, PB/Recent Best/Form unavailable; settings editable |
| Event | Legitimate catalogue facts/provenance; no personal history; missing analytics remain unavailable |
| Saturday Somewhere New / Challenge | Catalogue opportunities with origin; without origin, setup explanation |
| Saturday Run Faster | Existing PB/course evidence required; unavailable when missing; no weakened maths |
| Saturday Finish Higher | Existing historical Competition fallback may be non-personalised; no form equivalents without Form |
| Saturday Quiet | Historical field evidence required |
| Saturday Hidden Gem | Existing Hidden Gem V1 evidence/engine only |
| Saturday Surprise | Existing genuine catalogue/personal/analytical signals only |
| PB Finder / WCIP / Compare / Hidden Gems | Existing evidence requirements; manual hypothetical placement needs public history; no fabricated ranks/form |

A manual run can establish Overall 5K PB but does not waive Current Form support/factor requirements. PB Finder excludes null PB Scores from the PB sort (no invented PB ranks); factual travel/elevation sorts retain their existing semantics. No score formula is changed. Canonical external/out-of-scope performances remain recorded facts; B2A trusted visit rules are unchanged. Zero trusted catalogue gives **No events available yet**, never demo fallback.

## Verification

Targeted shared grid and browser-component tests, PostgreSQL settings ownership/validation/export/delete, additive SQL clean/upgrade paths within test-owned schemas, and Playwright onboarding across 360/390/430 px. Browser tests use the pinned Chromium and documented IPv4-first DNS. Existing auth and demo browser regressions remain required. Known out-of-scope LOW items remain: auth request without deadline can hold Web Lock; importer stat/read TOCTOU.

### B3 verification record (2026-10-13)

| Check | Result |
| --- | --- |
| PostgreSQL / migration status | Healthy; all 10 migrations applied |
| Clean SQL + main upgrade / Prisma clean + B1 upgrade | Passed; canonical references/settings preserved |
| Shared / web | 67 / 60 tests passed, one Vitest worker |
| Complete API/PostgreSQL | 458 tests passed in 36 files; `--maxWorkers=1 --testTimeout=30000` |
| Final empty-catalogue message correction | Both B3 account tests and all 20 Saturday orchestrator tests revalidated |
| Typecheck / API + web production builds | Passed |
| DEMO Playwright | 188 passed in full run; remaining test passed isolated after diagnosing server restart; all 189 covered |
| PB Finder after eligibility fix | All 6 browser scenarios passed at 360/390/430 px |
| Final auth/catalogue + B3 Playwright | All 21 passed at 360/390/430 px, including 12 B3 scenarios |

The restored workspace initially had old September demo fixtures and incomplete dependencies. Dependencies were restored from the unchanged lockfile. The supplied test database passed the demo seed guard before its disposable demo fixtures were regenerated for the current date. Historical bootstrap tests exceeded the default five-second timeout on this executor; the CLI deadline was increased, without relaxing assertions. Browser validation was interrupted by generating Prisma during a watched-server run; the affected unchanged test was diagnosed and rerun in isolation. Final browser validation ran without concurrent builds/generation.

Self-review corrections: PB sort no longer ranks null scores; no-catalogue explanation takes precedence over intent-specific missing items; callbacks after unmount/auth change cannot update geolocation UI or navigate; stale preferences copy removed; onboarding specs explicitly separated from DEMO specs. The manual-performance browser selector uses the existing accessible `radio` role. No analytical formula, auth-transition mechanism, catalogue provenance rule or canonical performance model was redesigned.
