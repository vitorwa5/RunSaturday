# 5K Compass

**Your guide to Saturday 5Ks.**

> 5K Compass is the public product name. **RunSaturday** remains the internal project name: the repository, workspace packages (`@runsaturday/*`), database, environment variables and code identifiers keep it.

5K Compass is a mobile-first decision-support app for runners choosing *where* to run on Saturday. It turns event data into explained, goal-specific recommendations (PB, placing, hidden gems, new events, quiet events, challenges). It is an independent project and is **not affiliated with or endorsed by parkrun** or any event organiser.

> **Status: Phase 2B (discovery and performance tools: Where Could I Place?, PB Finder, Hidden Gems, Compare).** All event data is **fictional DEMO data**. No real event statistics are included, and no data is collected from external sites.

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
| `npm run test:e2e` | Playwright at 360 px and 430 px (starts its own demo servers) |
| `npm run db:up` / `db:down` | start/stop the Docker database |
| `npm run db:migrate` / `db:seed` / `db:reset` | Prisma migrations / DEMO seed / full reset |

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
| `GET /api/profile` | current (demo) user profile |
| `GET /api/placement?time=&window=&target=&maxTravel=` | Where Could I Place?: historical placement per event for a 5K time (`1170` or `19:30`) |
| `GET /api/events/:idOrSlug/placement?time=&window=` | one event's historical placement (Event page outlook) |
| `GET /api/pb-finder?maxTravel=&sort=&surface=&elevation=&confidence=&visited=` | events ranked or sorted using the stored (demo) PB Score |
| `GET /api/hidden-gems?mode=&maxTravel=&time=` | Hidden Gem V1 ranking with component breakdowns |
| `GET /api/compare?ids=a,b[,c,d]&time=&window=` | 2–4 events side by side, with best-value markers and optional historical placement |

Without `lat`/`lon`, the user's saved home location is the origin. There's no authentication yet: every request acts as the demo user (see `http/context.ts`).

Errors always use the shape `{ "error": { "code", "message" } }` with a human-readable message. Stack traces and driver errors go only to the structured server log.

## Data model (Prisma)

- **Event**: identity, location, course facts, and facilities (`YES / NO / UNKNOWN`, never guessed). `source` is `DEMO` or `IMPORTED`.
- **EventOccurrence**: one per event per date (unique). `status`, `dataQuality`, plus a **derived summary cache**: participant count and winner/3rd/5th/10th times (see *Source of truth* below).
- **Result**: the **canonical** record of each position and finish time (seconds), optional pseudonymous `athleteKey` (never a name), optional age grade.
- **User**: home location, travel limit, lifetime PB / recent best / current estimate kept separately, preferred goal.
- **UserEvent**: visited, favourite, visit count, PB per event.
- **EventScore**: immutable score **snapshots**: PB / difficulty / competition / gem scores, confidences, component values (JSON), sample size, `calculatedAt`.
  - Each snapshot is identified by **`(eventId, calculationVersion, windowDays, asOfDate)`** (unique).
  - So 30/60/90/365-day (and later all-time, `windowDays = 0`) scores coexist, and earlier snapshots stay available to reproduce past calculations and draw trend charts.
  - `asOfDate` is a calendar date (`DATE`): the last day of data included.
  - The API serves the latest snapshot of `ACTIVE_SCORE_VERSION` in the default 90-day window (`config/analysis.ts`).

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

- **Histories are generated deterministically** from the event and date, so re-seeding is stable. Placing times are derived from the generated result rows, so the two always agree.
- **Scores are hand-written placeholders** (`calculationVersion = demo_v0`), not algorithm output.
- **Edge cases are included on purpose:** one event has a cancellation, and one new event has too few occurrences for confident scores ("Limited data").

The UI labels this data as DEMO everywhere it appears.

### Placeholder ranking (until the Saturday Score exists)

Home and the Saturday Planner rank events by **one stored metric per goal**: PB Score, lowest Competition, Gem Score, nearest unvisited, or fewest runners. The UI always says which metric was used ("Demo recommendation · ranked using PB Score"), and no Saturday Score is shown.

- **Planner filters** use only stored properties. When a filter is active and an event's value is unknown, the event is left out rather than guessed.
- **Dates:** planning covers the next 4 Saturdays. Rankings don't yet change with the date.
- **"Your outlook"** on the Event page shows the runner's current form. Expected time, historical placement and Top-10 frequency stay "Not available yet" until the placement and course-adjustment engines exist.

### Historical placement engine v1

`apps/api/src/domain/placementEngine.ts` is pure and deterministic. For a target time T and each usable occurrence, the historical placement is (Result rows faster than T) + 1. Postgres does the counting in one grouped query (`listPlacementInputs`).

- **Usable occurrences** are completed and validated, with a Result-row count that matches the participant count. Cancelled dates and partial imports are excluded and counted.
- **Statistics:** median (rounded half up), best, worst, a typical range (25th–75th percentile, nearest rank), and Top 3/5/10, Top 10% and Top 25% shown as "N of M events".
  - Percentage targets compare against the field *including* the runner, and the winner always counts.
- **Confidence** comes from the number of usable events: 10+ is high, 6+ medium, 3+ low, fewer is "Limited data" (`domain/confidence.ts`).
- **Wording:** frequencies describe history ("Top 10 in 10 of 12 events"), never a chance of anything.

### Hidden Gem V1 (`hidden_gem_v1`)

`gemScore = 0.35·placement opportunity + 0.25·small field + 0.15·travel convenience + 0.15·reliability + 0.10·not visited`. Each part is scaled to 0–100 first, and every result returns its breakdown.

| Part | How it's scaled to 0–100 |
| --- | --- |
| Placement opportunity | The runner's historical Top-10 share over 90 days. Without a runner time: 100 − Competition Score. |
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
3. Competition Score
4. Where Could I Place? (historical placement engine)
5. PB Score
6. PB Finder
7. Hidden Gems
8. Map
9. Profile and accounts
10. Saturday Planner

Weather, travel-time APIs, notifications and Android packaging come after the data pipeline is reliable.
