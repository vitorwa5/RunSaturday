# B1.1 + B2A integration candidate

This candidate is based on B1 `92ce64d886ca76aa8a8b20c14e10ba7644ff36f2`.
It does not merge or update `main`, rewrite the reviewed source branches, retrieve external data,
or start B2B/B3. The catalogue fixtures used below are explicitly synthetic test inputs.

## Auditable linear history

All exclusive commits were applied in order with `git cherry-pick -x`, retaining authorship:

| Reviewed source commit | Candidate commit |
| --- | --- |
| B1.1 `5cb73d6ee571bfd52daae36e5a5dce02ab218df2` | `5c74d8c` |
| B1.1 `15db1be1455cc7be89dd307115dd06a6d4bb6705` | `6662572` |
| B1.1 `8234120949f523ad01e1069d7d81682d1040e861` | `f3b9483` |
| B2A `c2e531e01628db2dd7176ccf24cc7fa9d8414154` | `ec49f34` |
| B2A `8bfe22b127655f016efbfee19d01ee9ea1d7bc86` | `7f8fbae` |

After the first three picks, the candidate tree matched the approved B1.1 tree exactly.
The subsequent integration-resolution commit completes the three manually combined hunks
and adds focused verification. No approved semantics were intentionally dropped.

## Overlap resolution

| File | Combined behaviour |
| --- | --- |
| `README.md` | Destructive seed opt-in and provider-neutral catalogue documentation |
| `apps/api/prisma/seed.ts` | B1.1 guard before deletion; B2A explicit demo analytics scope |
| `apps/api/src/__tests__/auth.test.ts` | B2A provenance-valid fixtures plus B1.1 auth reference/session-race tests |
| `apps/api/src/app.ts` | B2A catalogue-mode assertion plus B1.1 explicit trusted proxies |
| `apps/web/src/pages/PerformanceFormPage.tsx` | Generation-guarded callbacks and inactive historical event option |
| `docs/B1-authentication.md` | Both branches' security, catalogue and startup instructions |
| `e2e/auth.spec.ts` | Imported catalogue/inactive edit assertions plus multi-tab lifecycle and queued-lock tests |

The manual textual conflicts were in `app.ts`, `auth.test.ts` and `e2e/auth.spec.ts`.
Other overlaps merged automatically and were inspected semantically.
All files exclusive to B2A match its approved source exactly. All files exclusive to B1.1
match its approved source except the additional assertions in `seedGuard.test.ts`.

The resulting startup validates database-backed beta authentication and matching catalogue mode,
retains proxy validation, and checks B1/B2A schema availability. The auth epoch, post-lock intent
checks, fixed seven-day sessions, single authoritative session response, ownership boundaries,
export fallback, and seed guard remain unchanged from approved B1.1.
The importer, trust policy, historical visit scope, analytics filtering, URL rejection,
`evidenceScope` and canonical performance preservation remain unchanged from approved B2A.

## Migration verification

`apps/api/src/__tests__/integrationMigrations.test.ts` creates two temporary schemas in the
**supplied `TEST_DATABASE_URL` database**, then drops only those schemas. It does not reset
the existing test schema or substitute another database.

* Clean install: deploy the entire current migration directory; check migration status,
  relevant explicit constraints/indexes and capture all application columns, constraints and indexes.
  Start the beta application and query health, session, catalogue and auth/provenance models.
* Realistic upgrade: extract the actual migration files from the B1 Git baseline and deploy them,
  including `20261003120000_email_auth_budgets`. Insert B1 User, Event, UserPerformance,
  UserEvent, Account, Session, EmailAuthBudget and Verification fixtures. Capture every
  existing column/value; add and deploy `20261003110000_catalogue_provenance`; assert all
  captured rows/values are unchanged and the complete schema fingerprint equals the clean install.
  The legacy IMPORTED Event remains untrusted; its canonical performance remains present.
  Start the upgraded beta application successfully.

B1.1 adds no migration. Catalogue provenance depends on existing Event/RunnerFormSnapshot models,
not on EmailAuthBudget. Both clean chronological ordering and application after the already-applied
budget migration pass. Published migration names remain unchanged.

## Cross-feature coverage

* `auth.test.ts`: trusted visit state before/after a forced Current Form export outage;
  canonical catalogue-linked performance still exported; no private error detail exposed.
* `auth.test.ts`: deletion revokes/removes personal/auth state while exact shared Event and
  CatalogueImportRun rows remain unchanged and accessible to the other account.
* `seedGuard.test.ts`: actual provider-neutral imported catalogue and audit rows cause refusal;
  catalogue, audit rows and performance count remain unchanged.
* `e2e/auth.spec.ts`: A records and edits a trusted subsequently-inactive event; an actual export
  response containing A's performance is held behind a controlled promise; another tab logs out;
  B signs in; release the old response; no download, personal-data flash or B history contamination.
  Existing real queued Web Lock delete/logout tests remain intact at all three mobile widths.
* Existing combined API tests exercise A/B Current Form input ownership with imported fixtures.
  Catalogue tests cover demo-cache rejection through `evidenceScope`, DEMO/legacy/active/inactive/
  external canonical history, Alphabet opportunities, Saturday and Hidden Gems candidate filtering.

## Validation record

* Targeted migration/auth/seed tests: 23 passed.
* Shared: 66 passed; web: 52 passed.
* Full API/PostgreSQL run: 452 passed and two unchanged initial demo-fixture tests hit their
  existing 5-second timeouts while other workspace checks were running. Both affected files were
  immediately rerun without concurrent builds: all 47 tests passed unchanged, with no timeout or
  assertion modifications. No database tests were skipped in the supplied environment.
* Typecheck and API/web production builds passed. Vite reports the existing large bundle warning.
* Supplied database migration status: nine migrations, up to date.
* Playwright: 189 demo and nine auth/catalogue tests passed on their first run, at 360/390/430 px.
  This includes the delayed-export integration scenario and actual queued delete/logout Web Locks.
  Used the environment's pinned Chromium and command-local IPv4-first DNS; no browser retries,
  arbitrary timing sleeps, assertion removal or application-source workarounds were needed.

Final self-review found no additional integration defect. The full combined diff was checked
against both approved sources, including the seven overlaps, startup/seed order, ownership,
auth intent, catalogue query/job boundaries and unchanged analytical mathematics.

An initial new migration-test helper used PostgreSQL's internal `char` type directly in a raw
Prisma query; the helper now casts `contype::text`. This affected the test introspection only.

## Post-integration / before-beta hardening

The two approved LOW items are intentionally unchanged: a network request without a deadline
can hold the auth lock too long; the local importer has a `stat()`/`readFile()` TOCTOU around its
nominal size limit. Integration does not add a new code path to either. Neither is fixed by this
candidate. Deployment, real datasets, historical ingestion and B3 remain separate work.
