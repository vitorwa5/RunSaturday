# B2A: event catalogue provenance foundation

B2A provides a provider-neutral boundary for **Saturday 5K catalogue records only**. No authorised live provider has been selected. There is no network retrieval, scraper, result ingestion, EventOccurrence importer, matched-runner importer, personal-history importer or A-number lookup.

**Real event catalogue data alone does not provide historical performance analytics.** No results, participant counts, PB Score, Competition, Course Speed Factor, placing history or Current Form conversion are manufactured from a catalogue record. Course facts and facilities not provided by this contract remain UNKNOWN/NULL. Existing analytical formulas are unchanged.

## Identity and provenance

`Event.id` is the immutable internal key used by performances/history. `(sourceNamespace, externalId)` is a database-unique external identity; both values are case-sensitive strings and the namespace must be lowercase. Leading zeros in external IDs are retained. Names and slugs are not external identity. The generated slug is a SHA-256 digest of the namespace/ID tuple and remains stable across renames; the importer never changes an existing internal ID or slug.

One provider identity maps to one Event for beta. Different providers using the same external ID produce separate Events. B2A deliberately does not infer that two provider records describe the same physical event; a future authorised reconciliation/multiple-reference design must do that explicitly.

New records retain `sourceUrl`, `sourceAttribution`, `sourceLicence`, optional `sourceUpdatedAt`, `importedAt`, explicit IANA `timezone`, ISO 3166-1 alpha-2 `countryCode`, optional country-prefixed `subdivisionCode`, active state and `catalogueImportRunId`. `country` is the English display label of the validated country code, not a guessed country from coordinates. GB represents the whole UK; England, Scotland, Wales and Northern Ireland can be expressed through `region` and `GB-ENG`, `GB-SCT`, `GB-WLS`, `GB-NIR`. Future countries are not restricted to GB. Subdivision validation checks code format/country prefix; it does not bundle a worldwide subdivision registry.

The migration adds nullable fields without backfilling unknown provenance or changing legacy IDs/rows. A database CHECK prevents half-populated source identities. New source identities require country, timezone, import timestamp and an import-run reference. The source/active/country/region index supports beta list filters; the composite unique index also supports namespace lookup. Referenced import runs cannot be deleted while an Event points to them.

## Canonical local JSON contract

```json
{
  "format": "5k-compass-catalogue-v1",
  "source": {
    "namespace": "demo.catalogue-example",
    "kind": "demo",
    "attribution": "Fictional development fixture; not a real event",
    "referenceUrl": "https://example.test/synthetic-catalogue",
    "licence": "Synthetic test data only"
  },
  "records": [
    {
      "externalId": "0007",
      "name": "Aster Fictional Saturday 5K",
      "countryCode": "GB",
      "subdivisionCode": "GB-SCT",
      "region": "Scotland",
      "town": null,
      "latitude": 56.1,
      "longitude": -3.2,
      "timezone": "Europe/London",
      "active": true,
      "officialUrl": null,
      "sourceUrl": null,
      "sourceUpdatedAt": null,
      "startTime": null,
      "startLocationText": null
    }
  ]
}
```

The example is synthetic, intended for a disposable development database, and must stay `kind=demo`. Tests use isolated synthetic stand-ins for future imported-provider records in the established **test database only**; they are removed afterwards. Do not relabel fictional examples as real beta data. A future authorised provider supplies its own namespace, attribution/terms and legitimate records with `kind=imported`; selecting/authorising that source is outside B2A.

Required record fields: string externalId/name/countryCode/timezone, numeric finite latitude/longitude within geographic ranges and boolean active. Text must be nonempty, trimmed and without control characters. Optional fields may be omitted or null. Start time is local `HH:mm`; timezone must be supplied explicitly, even for UK records, and is never inferred. Source updated timestamp must be ISO with an explicit UTC offset. URLs accept HTTP(S) without credentials; unsupported fields and malformed values are rejected, not coerced. Unknown course facts cannot be supplied through this catalogue-only contract. The source namespace prefix `demo` is reserved for demo sources.

Each record is a full replacement of the supported catalogue facts: omitting an optional field clears the previous value to unknown. Source attribution/licence changes are part of an update. The source reference URL is a fallback when the record has no source URL; it is never treated as an official event page.

## Workflow and import audit

From the repository root, after PostgreSQL is healthy and migrations are deployed:

```bash
# Local JSON only. Relative --file paths are resolved from the API workspace.
APP_MODE=demo npm run catalogue:import -- --file /absolute/path/synthetic-events.json --dry-run
APP_MODE=demo npm run catalogue:import -- --file /absolute/path/synthetic-events.json
# An authorised real file would use APP_MODE=beta and kind=imported.
```

Supply the database connection through `DATABASE_URL`; no auth/email secrets are needed by this local administrative importer. In tests use the supplied `TEST_DATABASE_URL` as instructed by AGENTS.md. Production forbids demo mode. Inputs are limited to 10 MiB/5,000 records per run. The CLI does not accept remote URLs, positional arguments or unknown options and performs no network retrieval. Its JSON output includes `runId`, `dryRun`, namespace and all counters. Rejected rows cause CLI exit status 2 with structured `index`, public `externalId`, issue path/code/message. Invalid envelopes or persistence failures exit 1 with a safe error. It never logs raw driver errors/connection strings or raw rejected payloads.

`CatalogueImportService` is shared by the CLI and future authorised adapters. The adapter obtains authorised data outside this service, maps it to the canonical envelope and calls `import`; no provider-specific code belongs in the application core.

An import creates a `CatalogueImportRun` with source metadata, start/completion times and mutually exclusive counters: received = created + updated + unchanged + deactivated + rejected. Active-to-inactive changes count as deactivated, not also updated. Duplicate external IDs within one input reject the later record. Validation rejections retain reasons, not raw payloads. Each Event points to its latest successful import; `importedAt` advances even when facts are unchanged. Audit rows retain run summaries, not a full history of every previous row value.

Accepted writes and the completed audit record commit in one transaction. A per-namespace PostgreSQL advisory transaction lock serializes concurrent imports across processes. A persistence failure rolls back the whole run, including earlier accepted writes and the audit row. A dry run uses the same validation/comparison rules but writes neither Events nor audit rows; its counts are a preview of that database state, not a promise against later changes.

Imports are deltas, not whole-provider replacement snapshots. **Absence does not mean deletion**: an upstream removal must be represented explicitly by `active=false`. Inactive Events remain addressable for owned history; list/search/recommendations use active Events. Internal rows are never deleted by this importer, preserving the existing `UserPerformance` restrictive FK. Reactivating an existing identity reuses its internal ID.

## Demo / beta read and analytical boundary

`PrismaDataStore` defaults to imported-only beta. Demo requires an explicit constructor mode, and `buildApp` rejects a store whose catalogue mode differs from `APP_MODE`. The production server passes the validated mode explicitly. MemoryDataStore remains demo-only.

Beta requires `source=IMPORTED` **and supplied source identity**. DEMO and legacy unprovenanced IMPORTED rows are excluded at the data-access boundary from lists/search/detail/ID resolution, occurrence history, placement SQL, stored scores, latest factor runs, matched performances and competition inputs. Demo uses DEMO rows/cohorts only. Query filters cannot override that scope. Catalogue list/search support countryCode/region/sourceNamespace filters; requests cannot choose demo trust in beta. Inactive history lookup remains possible within the same scope.

Analytics jobs require explicit APP_MODE; their Event selection and raw SQL inputs use the same scope. Full refresh recalculates only the corresponding demo/real users. Beta does not reuse legacy Runner Form caches: nullable `RunnerFormSnapshot.evidenceScope` is stamped `BETA_IMPORTED_V1` for new beta calculations, while old caches are ignored and recalculated with imported-only factors. No canonical personal input is deleted. Existing owned recorded facts and historical exports remain owned facts; a legacy DEMO reference has no beta course factor and cannot be used for Current Form conversion.

Catalogue-only Events appear in basic lists/Explore and detail with unknown facts and null/limited analytics. Their detail page explains the limitation and exposes source attribution/timezone/terms. A later existing analytics refresh may persist **unavailable** breakdowns with null values; that does not invent results or factors. Beta startup checks the new schema and fails before serving requests if migrations are absent.

## Verification

Focused tests cover required source identity, duplicate keys, provider separation, database uniqueness, concurrent imports, idempotent re-import, rename/metadata/coordinate corrections, explicit deactivation with a referenced performance, structured validation rejections, transaction rollback, counters, dry runs and genuine CLI execution. Database/API tests exercise demo exclusion through both direct repositories and routes, catalogue-only null analytics and rejection of a legacy demo-cohort form cache. Auth integration/browser fixtures are now imported synthetic records rather than exposed DEMO records; dedicated auth/form tests retain explicit synthetic model fixtures to prove non-vacuous cross-user isolation. Browser smoke tests verify honest catalogue-only detail and provenance at 360/390/430 px.

Source approval/licensing, actual production catalogue content, richer course facts, starting-area/travel, historical results and deployment/monitoring remain outside B2A.

## Independent-review corrections: historical visits and URL rejection

Canonical `UserPerformance` records remain available in history, personal summaries and export, including references outside the current catalogue scope. They are not automatically trusted visit/challenge evidence. `DataStore.listTrustedEventIds` resolves referenced identities through the existing mode-aware catalogue policy without an active filter. `scopedVisitHistory` supplies that explicit set to `deriveVisits`, shared by `loadUser` and Explore/Challenges. Trusted IMPORTED events retain historical credit after deactivation; current candidates still come only from active events. DEMO and legacy unprovenanced imports never count in beta, while demo-mode fixtures retain their own visits.

Profile's `uniqueEventsVisited` and catalogue visit card use scoped internal visits. `PerformanceSummary.uniqueEvents` remains the distinct recorded-place count, including external races and out-of-scope canonical facts. PBs and all recorded-run totals are unchanged. Most-visited/history, Alphabet, opportunity completion, Somewhere New, Saturday Challenge and Hidden Gem novelty share scoped visit state; no new analytical formulas are introduced.

URL validation catches malformed URL syntax and rejects whitespace, unsupported schemes and credentials as normal validation issues. Invalid row URLs contribute structured rejections without aborting valid sibling rows. Invalid source metadata remains an invalid envelope, rejected before persistence. Tests cover both paths, malformed-row dry runs with zero writes and persisted mixed imports with coherent counters.

The PostgreSQL regression records DEMO, legacy IMPORTED, trusted active, trusted subsequently inactive and external performances. It verifies canonical preservation/export, exactly two trusted visited events, Alphabet A/B only, unsuppressed C/D opportunities, inactive historical credit without Saturday candidacy, and explicit demo-mode isolation.
