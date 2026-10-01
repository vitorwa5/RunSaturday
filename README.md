# RunSaturday

**Find your best 5K this Saturday.**

RunSaturday is a mobile-first decision-support app for runners choosing *where* to run on Saturday. It turns event data into explained, goal-specific recommendations (PB, placing, hidden gems, new events, quiet events, challenges). It is an independent project and is **not affiliated with or endorsed by parkrun** or any event organiser.

> **Status: Phase 1 (technical foundation and app shell).** All event data is **fictional DEMO data**. No real event statistics are included, and no data is collected from external sites.

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
| `GET /api/recommendations/best-pick?goal=&maxTravel=` | best pick and alternatives, with reasons |
| `GET /api/profile` | current (demo) user profile |

Without `lat`/`lon`, the user's saved home location is the origin. There's no authentication yet: every request acts as the demo user (see `http/context.ts`).

Errors always use the shape `{ "error": { "code", "message" } }` with a human-readable message. Stack traces and driver errors go only to the structured server log.

## Data model (Prisma)

- **Event**: identity, location, course facts, and facilities (`YES / NO / UNKNOWN`, never guessed). `source` is `DEMO` or `IMPORTED`.
- **EventOccurrence**: one per event per date (unique). Participant count, winner/3rd/5th/10th times in seconds, `status`, `dataQuality`.
- **Result**: position, finish seconds, optional pseudonymous `athleteKey` (never a name), optional age grade.
- **User**: home location, travel limit, lifetime PB / recent best / current estimate kept separately, preferred goal.
- **UserEvent**: visited, favourite, visit count, PB per event.
- **EventScore**: PB / difficulty / competition / gem scores, confidences, component values (JSON), sample size, window, `calculationVersion`, `calculatedAt`.

## Demo data

`apps/api/src/demo/` defines 10 **fictional** events around North West England, with generic names such as "Riverside 5K". Real towns are used only for plausible geography.

- **Histories are generated deterministically** from the event and date, so re-seeding is stable. Placing times are derived from the generated result rows, so the two always agree.
- **Scores are hand-written placeholders** (`calculationVersion = demo_v0`), not algorithm output.
- **Edge cases are included on purpose:** one event has a cancellation, and one new event has too few occurrences for confident scores ("Limited data").

The UI labels this data as DEMO everywhere it appears.

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
