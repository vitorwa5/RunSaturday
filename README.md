# 5K Compass

**Your guide to Saturday 5Ks.**

> 5K Compass is the public product name. **RunSaturday** remains the internal project name: the repository, workspace packages (`@runsaturday/*`), database, environment variables and code identifiers keep it.

5K Compass is a mobile-first decision-support app for runners choosing *where* to run on Saturday. It turns event data into explained, goal-specific recommendations (PB, placing, hidden gems, new events, quiet events, challenges). It is an independent project and is **not affiliated with or endorsed by parkrun** or any event organiser.

> **Status: Phase 3A (core analytics: Competition V1, Course Difficulty V1, Confidence V2). PB Score is still a demo value until Phase 3B.** All event data is **fictional DEMO data**. No real event statistics are included, and no data is collected from external sites.

---

## Architecture

```
Data sources ─▶ Ingestion (server, later) ─▶ Validation ─▶ PostgreSQL ─▶ Analytics engine ─▶ RunSaturday API ─▶ Web/PWA ─▶ Android (Capacitor, later)
```

- **Clients never scrape anything.** The web app reads only from the RunSaturday API. If a source changes, it's fixed once on the server.
- **Scores are pre-calculated and versioned** (`EventScore.calculationVersion`). Clients never compute them.
- **Calculation logic lives in the API's `services/`**, not in React components. Data access sits behind a `DataStore` interface.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query 5, React Router 7, lucide-react icons |
| PWA | vite-plugin-pwa (manifest and app-shell service worker) |
| Backend | Node.js 22, TypeScript, Fastify 5, zod |
| Database | PostgreSQL 16, Prisma 7 (`@prisma/adapter-pg`) |
| Testing | Vitest (unit/API), Playwright (end-to-end, mobile viewports) |
| Later | Recharts (charts, Phase 2), Capacitor (Android) |

## Repository layout

```
apps/
  api/                       Fastify API (the only component that touches data)
    prisma/                  schema.prisma, migrations/, seed.ts (DEMO data)
    prisma.config.ts
    scripts/build.mjs        esbuild bundle → dist/server.js
    src/
      config/env.ts          zod-validated environment
      db/prisma.ts           Prisma client factory
      repositories/          DataStore interface + prisma/ and memory/ implementations
      services/              travel estimates, Phase 1 placeholder ranking
      routes/                health, events, recommendations, profile
      http/                  request context, input schemas, safe error handling
      demo/                  DEMO dataset definitions + deterministic history generator
      app.ts / server.ts     app factory (testable via inject) / entrypoint
  web/                       React PWA
    src/
      app/                   router, layout, query client
      api/                   fetch client and endpoint functions
      hooks/                 TanStack Query hooks (all data access)
      components/            ui/, navigation/, events/, goals/ (presentational)
      pages/                 one component per route
      lib/                   display mappings (labels, bands), date helpers
packages/
  shared/                    API DTO types, goals, time/date formatting (+ tests)
e2e/                         Playwright smoke tests
scripts/generate-icons.mjs   rasterises the SVG icon into PWA PNGs
docker-compose.yml           local PostgreSQL
```

## Getting started

Requirements: **Node.js ≥ 22.12**, npm 10, and Docker (or any local PostgreSQL 16).

```bash
npm install                              # also runs `prisma generate`
cp apps/api/.env.example apps/api/.env   # local config (git-ignored)

npm run db:up        # start PostgreSQL in Docker
npm run db:migrate   # apply migrations
npm run db:seed      # load the fictional DEMO dataset

npm run dev          # API on :3001, web on http://localhost:5173
```

**No database? Use demo mode:** `npm run dev:demo` serves the same DEMO dataset from memory (`DATA_SOURCE=demo`).

### Scripts (root)

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:demo` | API + web with hot reload (database / in-memory demo) |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm test` | Vitest across all workspaces |
| `npm run build` | API bundle (`apps/api/dist`) + web build (`apps/web/dist`) |
| `npm run check` | typecheck + test + build |
| `npm run test:e2e` | Playwright at 360, 390 and 430 px (starts its own demo servers) |
| `npm run db:up` / `db:down` | start/stop the Docker database |
| `npm run db:migrate` / `db:seed` / `db:reset` | Prisma migrations / DEMO seed / full reset |
| `npm run analytics:recalculate` | recalculate Course Speed, Difficulty, Competition and PB Score snapshots (`-- --as-of=YYYY-MM-DD` optional); the seed runs it too |
| `npm run runner-form:recalculate` | recalculate Current Form (`runner_form_v1`) snapshots for every user; run it after `analytics:recalculate` (the seed runs both) |

Database integration tests run only when you point them at a seeded database:

```bash
TEST_DATABASE_URL=postgresql://runsaturday:runsaturday@localhost:5432/runsaturday npm test -w @runsaturday/api
```

If Playwright's bundled browsers aren't installed, point it at an existing Chromium:
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

### Environment variables (`apps/api/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_SOURCE` | `database` | `database` (Prisma/PostgreSQL) or `demo` (in-memory) |
| `DATABASE_URL` | – | required when `DATA_SOURCE=database` |
| `HOST` / `PORT` | `127.0.0.1` / `3001` | API bind address |
| `LOG_LEVEL` | `info` | pino log level (structured JSON logs) |
| `CORS_ORIGINS` | `http://localhost:5173,…` | comma-separated allowed origins |
| `APP_TIME_ZONE` | `Europe/London` | defines "next Saturday" |
| `ACTIVE_SCORE_VERSION` | `demo_v0` | which `EventScore.calculationVersion` the API serves |

Web (optional, `apps/web/.env`): `VITE_API_BASE_URL` (default `/api`) and `VITE_API_PROXY_TARGET` (dev proxy target).

## API (Phase 1)

| Method & path | Description |
| --- | --- |
| `GET /api/health` | status, data source, database reachability |
| `GET /api/events?lat=&lon=` | active events with scores, travel estimate and visit state |
| `GET /api/events/search?q=` | match on name, town or region (case-insensitive) |
| `GET /api/events/nearby?limit=&maxTravel=&lat=&lon=` | nearest events by estimated travel |
| `GET /api/events/:idOrSlug` | event detail: facilities, recent occurrences, 90-day sample size |
| `GET /api/events/:idOrSlug/history?window=30\|60\|90\|365\|all` | occurrences in the window, median winner/3rd/5th/10th times, sample size and stored-history coverage |
| `GET /api/recommendations/best-pick?goal=&maxTravel=` | best pick plus 3 alternatives, with highlights and reasons |
| `GET /api/planner?date=&goal=&maxTravel=&surface=&elevation=&participants=&visited=&course=&confidence=` | Saturday Planner: ranked results, counts, and caveats |
| `GET /api/profile` | current (demo) user profile; PBs, recent best, visit counts and `performance` summary are derived from UserPerformance |
| `GET /api/profile/current-form` | Current Form (`runner_form_v1`) with its full breakdown: inputs, weights, exclusions, confidence, trend |
| `GET /api/profile/performance-summary` | derived values: lifetime PB, recent best (90 days), latest, totals, per-event count/PB/latest |
| `GET /api/profile/performances?eventId=&limit=` | the user's performances, newest first |
| `GET /api/profile/performances/:id` | one of the user's performances |
| `POST /api/profile/performances` | add a manual performance: `{ eventId, date, time }` (`time` = `MM:SS` or `HH:MM:SS`) |
| `PATCH /api/profile/performances/:id` | edit a manual performance (same body) |
| `DELETE /api/profile/performances/:id` | delete a manual performance (204) |
| `GET /api/placement?time=&window=&target=&maxTravel=` | Where Could I Place?: historical placement per event for a 5K time (`1170` or `19:30`) |
| `GET /api/events/:idOrSlug/placement?time=&window=` | one event's historical placement (Event page outlook) |
| `GET /api/pb-finder?maxTravel=&sort=&surface=&elevation=&confidence=&visited=` | events ranked or sorted using the stored (demo) PB Score |
| `GET /api/hidden-gems?mode=&maxTravel=&time=` | Hidden Gem V1 ranking with component breakdowns |
| `GET /api/compare?ids=a,b[,c,d]&time=&window=` | 2–4 events side by side, with best-value markers and optional historical placement |
| `GET /api/events/:idOrSlug/analytics?window=` | stored Competition V1 (for the window) and Difficulty V1 breakdowns, versions and confidence factors |

Without `lat`/`lon`, the user's saved home location is the origin. There's no authentication yet: every request acts as the demo user (see `http/context.ts`).

Errors always use the shape `{ "error": { "code", "message" } }` with a human-readable message. Stack traces and driver errors go only to the structured server log.

## Data model (Prisma)

- **Event**: identity, location, course facts, and facilities (`YES / NO / UNKNOWN`, never guessed). `source` is `DEMO` or `IMPORTED`.
- **EventOccurrence**: one per event per date (unique). `status`, `dataQuality`, plus a **derived summary cache**: participant count and winner/3rd/5th/10th times (see *Source of truth* below).
- **Result**: the **canonical** record of each position and finish time (seconds), optional pseudonymous `athleteKey` (never a name), optional age grade.
- **User**: home location, travel limit, preferred goal, and the current 5K **estimate** (not a performance).
- **UserEvent**: favourite events.
- **UserPerformance** (Phase 4A, generalised in 4A.1): the user's own performances.
  - **Where:** *either* a known internal `eventId` *or* an `externalEventName` for a course 5K Compass does not model. Exactly one is set, enforced by a database CHECK constraint. No Event row is ever created for an external race.
  - **What:** `date`, `finishTimeSeconds`, `distanceMeters` (5000 for everything today) and `performanceType` (`PARKRUN`, `ROAD_RACE`, `OTHER_RACE`).
  - **Origin:** `source` (`MANUAL` now; `CSV`, `PARKRUN_API`, `GARMIN`, `STRAVA` reserved), optional `externalResultId`, and `verified`.
  - **Duplicates:** a deterministic `duplicateKey` is unique per user (see below).
  - **Event deletion:** events are delete-restricted, so removing an event never silently deletes someone's history.
- **EventScore**: immutable score **snapshots**: PB / difficulty / competition / gem scores, confidences, component values (JSON), sample size, `calculatedAt`.
  - Each snapshot is identified by **`(eventId, calculationVersion, windowDays, asOfDate)`** (unique).
  - So 30/60/90/365-day (and later all-time, `windowDays = 0`) scores coexist, and earlier snapshots stay available to reproduce past calculations and draw trend charts.
  - `asOfDate` is a calendar date (`DATE`): the last day of data included.
  - The API serves the latest snapshot of `ACTIVE_SCORE_VERSION` in the default 90-day window (`config/analysis.ts`).

- **CourseFactorSnapshot**: Course Speed Factor V1 per event and run, keyed by `(eventId, version, windowDays, asOfDate)`. Stores the factor and log-factor, the runner-bootstrap replicate log-factors (`Float[]`, index-aligned across events of one run), matched-runner and comparison counts, median date gap, dispersion, confidence, and the breakdown JSON. It has its own table because it is not a 0–100 score and carries the bootstrap draws, so it doesn't fit `EventScore`.

### Personal performances (Phase 4A)

**Canonical vs derived.** `UserPerformance` rows are the only stored record of a user's actual runs. Everything below is **derived on the server** (`services/userPerformance.ts`) and never stored or edited on its own:

| Value | Derivation |
| --- | --- |
| Overall 5K PB (API field `lifetimePb`) | fastest 5000 m performance of any type, parkrun or another race; equal times → the earlier date |
| parkrun PB | fastest 5000 m performance of type `PARKRUN` (may be the same performance; never invented) |
| Recent best | fastest 5000 m performance dated within `RECENT_PERFORMANCE_WINDOW_DAYS` (90, `config/analysis.ts`) up to today |
| Latest performance | most recent date |
| Event history | per internal event: count, PB and latest |
| Totals / visited | performance count; distinct places (internal events plus distinct external names); "visited" = has a performance at that internal event |

- **Field status:**
  - **Canonical:** `UserPerformance`; `UserEvent.favourite`. `User.current5kEstimateSeconds` became transitional in Phase 4B (Current Form now comes from `RunnerFormSnapshot`).
  - **Transitional, no longer read or written:** `User.lifetimePbSeconds`, `recentPbSeconds`, `lifetimePbEventId` and `recentPbEventId`; `UserEvent.visited`, `visitCount` and `personalBestSeconds`. They were kept so the migration is non-destructive and will be dropped in a later migration.
- **Migration:** the legacy single values have no dates, so SQL cannot turn them into performances. Instead the demo user's legacy history becomes a dated history (`demo/demoUserPerformances.ts`): each event keeps its visit count and PB (Riverside 34 runs/18:58, Victoria Park 6/19:36, Lakeside 2/19:09, Forest Trail 1/22:22). The lifetime PB (18:58 at Riverside) sits about 30 weeks ago and the recent best (19:32 at Riverside) 2 weeks ago. The other runs are deterministic and slower, so the derived values reproduce the old ones.
- **Validation (server):**
  - The event must exist.
  - The date must be a real calendar date, not in the future, and not before 1950 (a typo guard only).
  - The time is `MM:SS` (minutes may exceed 59) or `HH:MM:SS`, from 12:00 (below the 5K world record) to 9:59:59 (a typo guard). There are no elite or slow cut-offs.
  - A second performance at the same event on the same date returns 409.
  - Only `MANUAL` performances can be edited or deleted; imported ones return 403.
- **External courses (Phase 4A.1):** a performance with only `externalEventName` is a valid personal performance. It counts towards the overall 5K PB and recent best, and can be used in Raw time mode. It is **never** a course-adjustment source: the API gives it no source event, and the UI says "Course adjustment unavailable — this performance was recorded at a course not currently modelled by 5K Compass." The Add performance form offers just *parkrun* (choose an event) or *Other 5K race* (enter its name). No other distances are offered.
- **Duplicates (Phase 4A.1):** `duplicateKey` is `event:<eventId>|<date>|<distanceMeters>` for internal events, and `external:<name, lower-cased, whitespace collapsed>|<date>|<distanceMeters>` for external races (`domain/performanceKey.ts`). It has a unique index per user, so duplicates never depend on how SQL treats NULLs. Importer idempotency stays on the unique `(userId, source, externalResultId)` index.
- **Migration 4A.1** is additive. It adds the columns, backfills existing rows to `distanceMeters = 5000`, `PARKRUN` and their `event:` key, makes `eventId` nullable, adds the CHECK constraints, and swaps the old `(userId, eventId, date)` unique index for the key. Ids and data are unchanged; I verified the 43 existing rows column for column.
- **Privacy:** every store method takes the owning `userId` and filters by it; another user's id is simply "not found". Until authentication exists, routes act as the demo user.
- **Where Could I Place?, Compare and the outlook** use the derived lifetime PB and recent best, together with the event where each was run, so course-adjusted mode needs no manual "Achieved at" for them. Typed times still need one.

### Runner Form V1 (`runner_form_v1`, Phase 4B): Current Form

Four separate concepts, never mixed:

| Concept | Meaning |
| --- | --- |
| **Overall 5K PB** | best recorded 5000 m performance ever (any race): an achievement |
| **parkrun PB** | best recorded 5000 m parkrun: an achievement |
| **Recent best** | best recorded 5000 m performance in the last 90 days |
| **Current Form** | a *modelled* estimate of current **demonstrated 5K race capability**, from the strongest supported recent runs after accounting for course differences |

**Definition.** Current Form is *not* "your typical recent parkrun time". parkrun is often run easy, socially, while pacing someone or pushing a buggy, so a typical time understates what a runner can do. It is also not the single fastest result. In the app it is explained as:

> Current Form estimates your present 5K capability from your strongest supported recent performances, adjusted for course differences. Slower social or easy runs have less influence when faster performances are consistently demonstrated.

The app never assumes that a particular slow result was an easy run.

**Method** (`analytics/runnerForm.ts`; all parameters in `RUNNER_FORM_V1`):

1. **Eligibility.** 5000 m performances from the last **180 days**, at a known event whose Course Speed Factor is at least Medium confidence. Everything else is listed as excluded, with a reason:
   - other distances;
   - performances older than 180 days (an old PB is history, not current ability);
   - external courses 5K Compass does not model (never given the reference factor 1.000);
   - events with no factor, or a Low/Limited factor.
2. **Course adjustment.** `reference = actual ÷ course factor`: the equivalent on the **5K Compass course-reference scale**. Course Speed Factors are relative to the analysed event cohort, whose geometric centre is 1.000. That is a cohort reference, **not a universal neutral 5K course**; rescaling every factor by the same amount changes no source-to-target conversion. The model works in log space.
3. **Weights.**
   - *Recency:* `0.5^(age / 45 days)`, a smooth exponential half-life of 45 days. 45 days ago counts ½ and 90 days ago ¼.
   - *Course-factor confidence:* High 1.0, Medium 0.75.
4. **Supported performance frontier.** In log space, with evidence weight `b = recency × course`:
   - **Window.** For each run *i*, its window is the runs from *x_i* up to 3% slower (`BAND`): the runs that agree with it.
   - **Support.** The window's support is Σ *b* over its runs, so recent, well-normalised runs count more.
   - **Anchor.** The **fastest** run whose window holds **at least 2 runs** and at least **25%** of the best-supported window's support.
   - **Estimate.** Current Form = `exp(Σ b·x / Σ b)` over the anchor's window.
   - If no two runs agree within 3%, the band widens once to 6%. If still none agree, the recency-weighted median is used, capped at Low confidence.

   What this does:
   - Repeated near-fast runs reinforce each other.
   - Slower runs are listed as *slower* with no pull on the estimate while faster runs keep being repeated.
   - A single fast run that no other run agrees with is *not assumed*. It is listed as *faster, not yet repeated*, and it lowers confidence.
   - Two runs at a new, faster level move Current Form at once.
   - A faster level that now has much less support, for example because it is older, does not hold Current Form up. It is listed as an *earlier faster level*, so a genuine decline is followed.
   - An old PB outside the 180-day horizon has zero influence.

   **Why this method.** `src/__tests__/runnerFormCandidates.test.ts` runs five deterministic candidates on the same fixtures (times are course-adjusted, weekly, oldest first, recency-weighted):

   | Fixture (acceptable) | Weighted median | Previous Huber centre | Weighted 20th pct | Single fastest | **Supported frontier** |
   | --- | --- | --- | --- | --- | --- |
   | 20:00, 20:08, 20:14, 24:30–28:00 (20:00–20:20) | 25:00 ✗ | 24:23 ✗ | 20:14 | 20:00 | **20:08** |
   | same, fast runs most recent (20:00–20:20) | 24:30 ✗ | 22:56 ✗ | 20:08 | 20:00 | **20:07** |
   | 21:31, 21:44, 22:05, 23:18, 23:42, 24:05, 26:00 (21:31–22:05) | 23:42 ✗ | 23:28 ✗ | 21:44 | 21:31 | **21:48** |
   | 19:00, then 21:40–22:05 (21:40–22:05) | 21:52 | 21:48 | 21:40 | 19:00 ✗ | **21:54** |
   | 21:40–22:05, then 19:00 most recent (21:40–22:05) | 21:45 | 21:39 ✗ | 19:00 ✗ | 19:00 ✗ | **21:51** |
   | improvement 22:30 → 21:29 (21:29–21:45) | 21:46 ✗ | 21:50 ✗ | 21:29 | 21:29 | **21:41** |
   | ~22:06 runs + mistyped 15:00 (22:00–22:10) | 22:05 | 21:54 ✗ | 15:00 ✗ | 15:00 ✗ | **22:07** |
   | steady ~22:06 (22:03–22:10) | 22:06 | 22:06 | 22:04 | 22:03 | **22:06** |

   - The median and the previous Huber centre estimate a *typical* time, so slower runs drag them and they lag improvement.
   - A fixed percentile depends on the *share* of runs rather than on agreement, so one recent one-off becomes Current Form.
   - The single fastest run assumes one-offs and typos.
   - Only the supported frontier meets every fixture.
5. **Minimum data.**
   - No eligible runs: unavailable.
   - One run: *indicative* (its course-adjusted reference value, for reference only; no Current Form).
   - Two or three runs: an estimate capped at Low confidence.
6. **Confidence** (0–100, then High ≥ 75 / Medium ≥ 55 / Low ≥ 35 / Limited data). It is a weighted sum of seven parts, all measured **on the frontier runs**, so slower runs do not lower it while the frontier is consistently supported:

   | Part | Weight | Full marks |
   | --- | --- | --- |
   | Amount: effective number of frontier runs (recency-weighted) | 25% | 5 |
   | Frontier support: runs agreeing with the frontier | 20% | 4 runs; **halved** when a faster run is unsupported |
   | Recency of the latest frontier run | 20% | ≤ 14 days old; 0 at 120 days |
   | Consistency: weighted spread of the frontier runs | 15% | ≤ 0.8%; 0 at 2.5% |
   | Course-factor confidence of the frontier runs | 10% | — |
   | Different events among the frontier runs | 5% | 3 events |
   | Time coverage of the frontier runs | 5% | 42 days |

   Caps:
   - If the **newest** run is a faster run that no other run supports, the level is at most Medium until that run is repeated.
   - 2–3 eligible runs, a latest run over 90 days old, or the median fallback cap the level at Low.

   Confidence describes the evidence, never the chance of running the time.
7. **Trend.** A course-weighted least-squares slope of the log course-adjusted time against date. It uses:
   - the frontier runs;
   - any earlier faster level they replaced, so a genuine decline shows;
   - other runs within 6% of Current Form.

   Far slower runs, which may be easy, social or paced, and a one-off fast run therefore cannot manufacture a trend.
   - It needs at least 4 runs spanning at least 28 days; otherwise *Limited data*.
   - It is *Improving* or *Declining* only when the change is at least 1.5% per 90 days **and** |slope / standard error| ≥ 2. Otherwise it is *Stable*.
8. **Snapshots.** Current Form is stored in `RunnerFormSnapshot`, unique per (user, distance, version, asOfDate). It is recalculated:
   - when that user's performances change;
   - lazily, once per day;
   - as the **last step of the canonical refresh** (`npm run analytics:recalculate`, used by the seed, in `analytics/refreshAll.ts`): **Course Speed Factors → Difficulty → Competition → PB Score → event snapshots → Runner Form**.

   Updating the factors therefore always refreshes every user's Current Form from the new factors. Runner Form never triggers event analytics, so there is no cycle. `npm run runner-form:recalculate` runs the last step alone, for debugging or manual use.

   The API reads the snapshot and never recomputes per request.

**Using Current Form.** It is already on the course-reference scale, so converting it to an event is `equivalent = form × f_target`. It is never divided by a source factor, and no source event is invented.
- **Where Could I Place?, Compare and the Event outlook:** these default to Current Form (`basis=current_form`, read on the server from the user's own snapshot). Overall 5K PB, parkrun PB, recent best and typed times stay selectable, and Raw time mode is kept.
- **Hidden Gems:** uses Current Form converted per course.
- **Saturday Planner and Home best pick (goal by goal):**

  | Goal | Ranking inputs |
  | --- | --- |
  | PB | PB Score, a course characteristic; no runner ability |
  | High Finish | **Current Form** converted to each course, then the unchanged placement engine (share of the last 90 days' events where it reached the top 10, conservative ties; then median placing). Without Current Form: lowest Competition Score, labelled as a fallback |
  | Hidden Gem | `hidden_gem_v1` Gem Score, the same as the Hidden Gems tool; its placement opportunity uses **Current Form** converted to each course (else inverse Competition) |
  | New Event | visit state and estimated travel; no runner ability |
  | Quiet | average field size; no runner ability |
  | Challenge | not available yet |

  The response's `ability` says whether the goal used Current Form (`usesCurrentForm`) and what it used. Goals that do not depend on ability never load it.
- **When Current Form is unavailable:** every tool says so and falls back transparently. An old PB is never used as current ability.
- **Profile:** shows the descriptive *gap* between Current Form and the Overall 5K PB. There are no readiness or improvement predictions.

**Future effort metadata (documented only; V1 works without it).** A later version could record per-performance effort: *Hard/race*, *Normal*, *Easy/social*, *Pacing*, *Buggy/stroller*. Evidence from Garmin or Strava (heart rate, splits) could support it. Known easy efforts could then be set aside outright instead of relying on the frontier. V1 needs none of this, and never guesses a run's effort.

**Scope and future.** V1 is 5000 m only. A future 10K, half or marathon form must be its own distance-specific model with distance-specific course factors; a 5K Current Form is never reused for them. Current Form is the foundation for later features (PB gap, form trend, PB-attempt recommendations, adaptive training plans), none of which are implemented yet.

### Source of truth: Result vs EventOccurrence

**`Result` rows are the single source of truth for positions and finish times.** The summary columns on `EventOccurrence` are only a cache for fast listing:

- `participantCount`
- `winnerTimeSeconds`, `thirdTimeSeconds`, `fifthTimeSeconds`, `tenthTimeSeconds`

The rules:

- **One function computes them:** `summarizeResults()` in `apps/api/src/domain/occurrenceSummary.ts`.
- **Same write:** they are written in the same operation as the Results they summarise. The seed does this today; ingestion must do the same.
- **Never edited independently.** If they ever disagree with Results, Results win and the cache is recomputed.
- **Empty means NULL:** with no results (e.g. a cancelled event), they are NULL.
- **Tested:** a database test checks every occurrence's cache against its Result rows.

## Demo data

`apps/api/src/demo/` defines 10 **fictional** events around North West England, with generic names such as "Riverside 5K". Real towns are used only for plausible geography.

- **Histories are generated deterministically** from stable seeds, so re-seeding is stable. Placing times are derived from the generated result rows, so the two always agree.
- **A shared population of pseudonymous runners** (`demo-athlete-00001`…, no names) attends the events week by week. About 45% never leave their home event; the rest occasionally visit nearby ones. This gives the matched-runner evidence the Course Speed Factor needs.
- **Hidden simulation course effect:** each run's time = ability × slow fitness drift × the course's hidden effect (from elevation, surface and laps plus a small ±1.2% layout quirk) × that day's conditions × personal day noise, with occasional easy runs. The analytics never read the hidden effect: they have to recover it from matched runners. There is no 15:00 clamp, only a 13:00 safety floor.
- **Only the Gem base score is hand-written** (`demo_v0`, together with average participants). PB Score, Competition, Difficulty and Course Speed are all calculated.
- **Edge cases are included on purpose:** one event has a cancellation, and one new event has too few occurrences for confident scores ("Limited data").

The UI labels this data as DEMO everywhere it appears.

### Placeholder ranking (until the Saturday Score exists)

Home and the Saturday Planner rank events by **one stored metric per goal**: PB Score, lowest Competition, Gem Score, nearest unvisited, or fewest runners. The UI always says which metric was used ("Demo recommendation · ranked using PB Score"), and no Saturday Score is shown.

- **Planner filters** use only stored properties. When a filter is active and an event's value is unknown, the event is left out rather than guessed.
- **Dates:** planning covers the next 4 Saturdays. Rankings don't yet change with the date.
- **"Your outlook"** on the Event page converts the runner's recent best (else lifetime PB) from the event where it was run into an **equivalent 5K here** ("≈ 21:16, adjusted from 19:32 at Riverside 5K"), then shows how that equivalent would historically have placed. It is never called a predicted or expected finish.

### Historical placement engine v1

`apps/api/src/domain/placementEngine.ts` is pure and deterministic. For a target time T and each usable occurrence, Postgres counts results in one grouped query (`listPlacementInputs`):

- `fasterCount` = results with time < T
- `equalCount` = results with time exactly T

From those counts:

- **Placing range:** best = `fasterCount + 1`, worst = `fasterCount + equalCount + 1`.
- **Why a range:** results are recorded to the second, so when others share T the exact placing is unknowable. For example, 4 faster and 3 on the same time gives 5th–8th.
- **No ties:** when `equalCount` is 0, best and worst are the same.
- **The runner:** the hypothetical runner is never counted as one of the equal results.

How the results are used:

- **Usable occurrences** are completed and validated, with a Result-row count that matches the participant count. Cancelled dates and partial imports are excluded and counted.
- **Statistics:**
  - Median is shown as a range: median of best placings to median of worst placings, each rounded half up.
  - Best and worst are the best-case minimum and the worst-case maximum.
  - The typical range runs from the 25th percentile of best placings to the 75th percentile of worst placings (nearest rank).
- **Targets are conservative.** Top 3/5/10, Top 10%/25% and "1st" count an occurrence only when the *worst* placing reaches the target. A tie that straddles the boundary does not count.
  - Percentage targets compare against the field *including* the runner, and the winner always counts.
- **Ranking and Compare's "Best"** use the conservative (worst-case) end of the median range.
- **Confidence** uses Confidence V2 (see Core analytics) on the placement data: the amount, recency and completeness of usable events, plus the stability of placings.
- **Wording:** frequencies describe history ("Top 10 in 10 of 12 events"), never a chance of anything.

### Core analytics (Phase 3A)

Scores are calculated by a backend job (`npm run analytics:recalculate`, also run by the seed) and stored as `EventScore` snapshots keyed by `(eventId, calculationVersion, windowDays, asOfDate)`. The full breakdown is stored in `components`. API requests read the latest snapshot and never scan Result rows. Re-running for the same date replaces that day's snapshots, and earlier dates are kept.

| Version | Rows per run | Stores |
| --- | --- | --- |
| `competition_v1` | one per event per window (30, 60, 90, 365, 0 = all) | `competitionScore`, `competitionConfidence`, breakdown |
| `difficulty_v1` | one per event (`windowDays` 0: structural) | `difficultyScore`, breakdown |
| `pb_v1` | one per event (`windowDays` 365) | `pbScore`, `pbConfidence`, breakdown (Phase 3B) |
| `demo_v0` | unchanged | Gem base and average participants only |

Course Speed Factors are stored in `CourseFactorSnapshot` (Phase 3B). The recalculation order is **course factors → Difficulty → Competition → PB Score**. In demo mode the in-memory store runs the same pure functions at startup, and a database test checks both modes give identical results.

**Competition V1** (`analytics/competition.ts`), 0–100. It measures historical competitive depth, *not* course speed.

- **Inputs:** completed, validated occurrences in the window whose Result rows are complete. Cancelled and partial dates are excluded.
- **Medians per event,** read from Result rows: winner (25%), 3rd (25%), 5th (20%), 10th (20%), and field depth (10%). Field depth is the top-10% cutoff time, at position ceil(0.10 × field), so the 20th of 200.
- **Cohort-relative normalisation,** with no fixed time thresholds. Each component's strength = 100 × (other events slower + ½ × other events tied) ÷ (cohort − 1).
  - Both counts are over the *other* events only; the event itself is never counted.
  - So a unique strongest event scores 100, a unique weakest scores 0, a cohort with identical values scores 50 throughout, and tied events always get the same score.
  - Faster is higher, and because the method is rank-based an extreme value cannot stretch the scale.
- **Score:** the weighted mean of the available components, with weights re-normalised.
- **Minimums:** 3 usable occurrences for an event; 3 observations per component; a cohort of 3 events per component; and at least half the weight available. Below these the result is "Limited data".
- **It is relative:** the score is relative to the events analysed for the same window. It is not an official or universal parkrun rating.

**Course Difficulty V1** (`analytics/difficulty.ts`), 1.0–10.0. It is structural only; finishing times and competition are not used.

- **Severity** = the weighted mean of the *known* parts:
  - elevation 55%: min(m, 150) ÷ 150 × 100
  - surface 25%: tarmac 0, mixed 40, grass 70, trail 70
  - structure 20%: point-to-point 0, one lap 10, out-and-back 35, two laps 45, three or more laps 70. If the course type is unknown, the lap count is used.
- **Difficulty** = 1 + 9 × severity ÷ 100.
- **Unknown inputs** are never assumed easy. They are left out, flagged in the breakdown, and lower the confidence: missing elevation gives Low, any other missing part gives Medium. Below 45% known weight there is no rating.

**Confidence V2** (`domain/confidence.ts`), an internal 0–100 score plus High/Medium/Low/Limited data. It describes the *data*, never the chance of a result.

- **Formula:** 40% amount (full marks at 12 usable events) + 25% recency (100 up to 7 days old, falling to 0 at 90) + 20% completeness (usable ÷ non-cancelled) + 15% stability.
- **Stability** is MAD ÷ median: the median absolute deviation, which one outlier can't move much. Its tolerance is 10% for cutoff times and 50% for placings, with the denominator floored at 10 places.
- **Levels:** High 75+, Medium 55+, Low 35+. Fewer than 3 observations is always "Limited data".
- **Used by** Competition V1 and historical placement.

### Course Speed Factor V1 (`course_speed_v1`, Phase 3B)

`analytics/courseSpeed.ts`. How fast a course has historically been for **the same runners**, relative to the analysed events. Factors are centred so the **geometric mean of the eligible analytics cohort is 1.000**. So 1.000 is a cohort reference, **not a universal, physically neutral 5K course**: 0.963 means "historically faster relative to the analysed course cohort", never "3.7% faster than a neutral course". Winner times, Competition, records and elevation are not inputs.

- **Matching, without pseudo-replication.** Only results with a pseudonymous `athleteKey` from usable occurrences in the last 365 days are used. For each athlete and each event pair, candidate run pairs within 90 days are sorted by (date gap, date A, date B) and matched **one-to-one, without replacement**, so no run is used twice in a pair.
  - Each match gives y = ln(t_B ÷ t_A), a ratio that means the same for fast and slow runners.
  - **Date-gap weights:** ≤14 days 1.0, ≤28 0.8, ≤56 0.5, ≤90 0.25. Beyond 90 days the match is excluded (configurable in `COURSE_SPEED_V1.GAP_BANDS`).
  - The total weight **one athlete contributes to one event pair is capped at 3** (scaled down proportionally), so regulars can't dominate.
- **Global network fit.** y ≈ θ_B − θ_A with θ = ln(factor), fitted jointly over every comparison by iteratively reweighted least squares.
  - **Outliers by model disagreement:** Huber weights with k = 1.345 × a robust scale (1.4826 × MAD of the residuals). A comparison is down-weighted because it disagrees with the model, never because a time is slow in absolute terms.
  - **Anchor:** Σθ = 0, so the factors' geometric mean is exactly 1.000.
- **Eligibility, with no fallback.** An event needs at least **20 matched runners and 40 comparisons** (re-checked until stable) and must sit in the largest connected part of the comparison network. Otherwise: "Course adjustment unavailable — limited matched-runner data". Nothing is estimated from elevation instead.
- **Uncertainty: a runner-cluster bootstrap.** The whole fit is repeated on 200 resamples of *athletes* with replacement (all of an athlete's comparisons move together), using deterministic seeds. Replicates are index-aligned across events, so a source→target ratio interval is taken per replicate and keeps the joint estimation's correlation. It describes uncertainty in the **course comparison only**, not a runner's day-to-day variation, so it is never labelled a confidence or prediction interval for a finish time.
- **Factor confidence** (0–100 plus High/Medium/Low/Limited data; levels 75/55/35):
  - matched runners 25% (full marks at 60)
  - comparisons 20% (full at 150)
  - connectivity 15% (full at 3 directly compared events)
  - date proximity 15% (mean gap weight)
  - model agreement 15% (robust residual spread; 0 at 8%)
  - recency 10%

  A bootstrap half-width above 2% caps the level at Low.

**Course adjustment** (`services/courseAdjustment.ts`): **equivalent = source × (f_target ÷ f_source)**, rounded to a whole second. It depends only on the factor *ratio*, so moving the cohort reference (multiplying every factor by the same constant) never changes an equivalent; a test checks this. The same event gives back the source time.

- **Requirements:** both factors must be at least **Medium** confidence. The same event means no adjustment.
- **Display:** the UI shows a labelled point estimate ("Equivalent here ≈ 20:43"), the adjustment in seconds, and the lower of the two factor confidences. The bootstrap conversion range is kept in the API as course-comparison uncertainty only.
- **Placement:** in course-adjusted mode the equivalent time goes through the **unchanged** placement engine, one data query per distinct equivalent time.

**Where Could I Place?** gains:

- an "Achieved at" event: profile presets carry theirs, and a typed time can be given one;
- two modes, *Course adjusted* (the default when the source event's factor is reliable) and *Raw time*.

In the API, `mode=auto` (the default) falls back to raw time only with a `modeNote`. `mode=adjusted` never falls back silently. Events that can't be adjusted are listed under `unavailable`, never placed with the unadjusted time. Compare accepts the same `source`.

**Distances.** Course Speed Factor V1 is **5K-specific**: it is fitted from 5K results at the modelled 5K events, and `distanceMeters` plays no part in it. A future 10K, half marathon or marathon must get its **own, distance-specific factors**. 5K factors must never be reused for other distances, and a performance's `distanceMeters` must match the factor's distance before any course adjustment.

### PB Score V1 (`pb_v1`, Phase 3B)

`analytics/pbScore.ts`, 0–100: how favourable an event has historically been for a fast 5K, relative to the analysed cohort.

`PB = 0.75 × observed course speed + 0.25 × structural suitability`

- **Observed course speed** is the cohort mid-rank of the Course Speed Factor, where lower factor scores higher. It uses the same rank method as Competition (self excluded, ties shared).
- **Structural suitability** is the same rank method on inverse Course Difficulty.
- **Competition is never an input.** A strong field is not a fast course. Weather is not modelled.
- **Cohort:** events with a fitted factor that isn't Limited data, and at least 3 of them. It is calculated once per snapshot, so user filters never change a PB Score.
- **No factor, no score:** "PB Score unavailable · Limited matched-runner data". There is no fallback to the old demo value.
- **PB confidence** is the Course Speed Factor's confidence.

### Hidden Gem V1 (`hidden_gem_v1`)

`gemScore = 0.35·placement opportunity + 0.25·small field + 0.15·travel convenience + 0.15·reliability + 0.10·not visited`. Each part is scaled to 0–100 first, and every result returns its breakdown.

| Part | How it's scaled to 0–100 |
| --- | --- |
| Placement opportunity | The runner's historical Top-10 share over 90 days. Without a runner time: 100 − Competition V1. |
| Small field | 50 or fewer average runners scores 100; 500 or more scores 0. |
| Travel convenience | 1 − estimated minutes ÷ travel limit. |
| Reliability | High 100, Medium 70, Low 40, Limited data 10. |
| Not visited | 100 if not visited, 0 if visited. |

Unknown inputs score 0. Gem Score is a 5K Compass ranking, not an official parkrun metric.

## Product rules enforced so far

- Every recommendation names the metric it was ranked by and lists "Why this?" reasons.
- Low-data events never outrank events with sufficient data, and are labelled "Limited data".
- Sample sizes are visible. Unknown facilities show as "Unknown".
- Travel times are labelled as estimates (straight-line distance with a road factor).
- Colour is never the only signal: badges carry text and/or icons.
- Location is optional, and the profile carries an independence disclaimer.

## Roadmap

Phase 1 is complete (foundation and shell). Next phases follow the master specification:

1. data ingestion and validation, with an import-health admin view
2. full Event page with charts
3. Competition Score (done, Phase 3A)
4. Where Could I Place? (historical placement engine; course-adjusted in Phase 3B)
5. PB Score (done, Phase 3B: PB Score V1 from Course Speed Factor V1)
6. PB Finder
7. Hidden Gems
8. Map
9. Profile and accounts
10. Saturday Planner

Weather, travel-time APIs, notifications and Android packaging come after the data pipeline is reliable.
