# Independent QA: private phone-test release candidate

Reviewed 2026-11-03. Candidate: `release/phone-test-rc` at `2ca7c2c92da1141ae1e28f6362ccb79af8049ea8`, inspected in `/workspace/RunSaturday-rc`. Raw execution evidence: `/workspace/RunSaturday-release-next-evidence`. This report reviews source and coordinator-generated artifacts independently; the QA reviewer authored regression tests and fixtures, not the application or deployment implementation.

**APPROVE the reviewed code, build artifacts and private-staging preparation for owner review. REJECT a claim that this is already deployed, real-phone validated, production ready or authorized for deployment.** No merge or deployment is authorized by this QA disposition. PR 7's previously authorized merge does not authorize merging draft PR 8. Runtime artifact inspection is recorded below; external host, database and device validation remain separate gates.

## Execution evidence

| Check | Actual result and evidence |
| --- | --- |
| Database-backed API | `api.json`: success, 478 passed, 0 failed, 0 pending; `api.log` records Prisma 7.10.1 generation and one-worker invocation |
| Web unit suite | `web.log`: 117 passed across 14 files |
| Shared suite | `shared.log`: 82 passed across 6 files |
| Typecheck / application build | `typecheck.log`, `build.log`, `private-web-build.log`; `final-build.exit` = 0 |
| Release guards | `staging-guards.log`: 12 passed, 0 failed; local fake-client/stub-process tests, not a live staging DB exercise |
| Built PWA | `pwa-browser.log`: 9 passed in 20.1 s, three cases at each Chromium-emulated width 360/390/430 |
| DEMO browser suite | `browser-demo.log`: 195 passed in 5.4 min, including six new mobile navigation/product-matrix cases |
| Auth/beta browser suite | `browser-auth.log`: 117 passed in 4.7 min |
| Old-worker/new-API upgrade | `browser-cache.log`: 1 passed in 6.3 s; real old/new worker lifecycle and bound private import |
| Combined browser lane | `browser.exit` = 0; use the actual suite counts above, not a pre-run estimate |
| Production dependency audit | `dependency-audit-final.json`: 0 vulnerabilities |
| Full development dependency audit | `dependency-audit-all.json`: 10 entries, 8 moderate and 2 low; 0 high/critical. Remaining chain is build tooling through vite-plugin-pwa/workbox-build, glob/minimatch, EJS/Jake/filelist, deepmerge and Rollup helpers. This is an explicit residual build-time risk, not a zero finding |
| Synthetic catalogue preparation | `staging-dry-run.json`: 2 records, `databaseContacted:false`; `staging-catalogue-dry-run.json` labels fictional locations and contains no historical results/scores |
| Three container builds | `image-builds.exit` = 0; final `image-private-api-build.log`, `image-private-web-build.log`, `image-migrate-build.log` all complete at the reviewed candidate |

The initial PWA attempt is retained in `pwa-browser-initial-failed.log` (6 pass, 3 fail). Those three failures were the uppercase test expectation for the lowercase public CSV provenance enum. A further test correction observes the current account through the actual Profile flow. QA-only corrections `6c5feac`/`0a4c913` (candidate cherry-picks `7ddea2c`/`07d0baf`) precede the final passing run; the initial evidence was not overwritten. Initial API/dependency/build evidence is also retained separately. Current passing evidence supersedes those earlier runs only for the tested behavior.

The final Dockerfile changes followed the browser runs and affect packaging: shared install/build step with package cache excluded from image layers, offline pruning, minimal runtime copy, and OpenSSL 3 detection for Prisma. The three final image builds therefore provide packaging evidence in addition to the earlier application/browser evidence. An actual staging session has not been exercised through those images.

## Product coverage and data limits

| Surface | Evidence-backed result | Real-data/private-host limit |
| --- | --- | --- |
| Home / Saturday | DEMO ranking explanations, intent/filter/date/travel flow, recommendation navigation and mobile fit pass; beta empty-catalogue states are covered | Authorized live event/results data is unavailable; synthetic stage may have only two catalogue records |
| Explore / Challenges | Search, visits, challenge handoff and missing-letter flows pass; search focus is preserved | Synthetic CSV rows cannot establish trusted event/challenge credit |
| PB Finder | Existing filter/ranking/course-score cases and mobile landmark checks pass | Catalogue-only events have no derived course scores or real personal PB evidence |
| Where Could I Place? | Existing placement/current-form cases and mobile controls pass with explicit source/time semantics | Historical results/confidence and adjustment evidence remain unavailable in synthetic staging |
| Hidden Gems | Existing mode/result/empty-state flows and mobile labels pass | No real-world ranking validity is established by fictional data |
| Compare | Existing event comparison/current-form cases, labelled removal and mobile fit pass | Missing catalogue/results values must remain explicitly unavailable |
| Event details | Existing facts/provenance/analytics cases and synthetic imported catalogue-only beta flow pass | Two optional synthetic events contain no occurrences, results or scores |
| Map / saved-event actions | Reserved/unavailable features and keyboard navigation are covered | These are not completed external map/saved-event integrations |
| Auth / profile / private history / CSV | Existing CENTRAL/B4/H1 tests plus full beta suite pass; built-worker replacement-account case passes | Disposable synthetic sessions establish neither real email delivery nor permission to ingest personal/third-party data |
| Offline / reconnect | Real generated controlling worker, safe offline shell, hidden private CSV, authoritative retry/reconnect and replacement account pass | Real phone standalone/basic-auth interaction and device cache behavior remain untested |
| Install / mobile accessibility | Manifest/icons, 360/390/430 layout, named controls, tab/route/skip-link focus and keyboard search pass | Chromium emulation is not a physical iOS/Android installation or manual screen-reader audit |

All tools are demonstrated with explicitly labelled DEMO or disposable synthetic fixtures. Real authorized event/results/history sources have not been supplied. The optional private import prepares exactly two fictional catalogue events and was dry-run only. No historical analytics are fabricated to fill the gaps. A passing DEMO matrix is not evidence of real-data product usefulness.

## Source and artifact assessment

The reviewed expiry barrier (`369cda6`, candidate `bd0251f`) keeps reconnect/bootstrap validation authoritative when expiry notifications arrive, and the real built-worker suite exercises failed bootstrap retry and offline account replacement. Strict personal-performance date validation (`afdef6c`, candidate `698f5d4`, with boundary regressions `84d59f2`) rejects invalid calendar components while retaining the existing shared invariant. CENTRAL H1/M1 schema and shared-invariant scope remain unchanged; this report relies on the existing targeted security coverage and full suite, without claiming a new comprehensive security audit.

Private preparation uses a dedicated compose file, immutable-image bindings, loopback default publication, private-IP/interface guards, external restricted-permission secret/TLS/inbox files, all-route basic authentication and stripped upstream Authorization. API/migration/import wrappers require the exact synthetic DB identity and inspect provenance; ambient libpq overrides are rejected. Guard tests are local simulations and do not certify a host firewall, certificate, VPN route or database.

The private Caddy variant removes the inherited privileged-bind file capability and runs as UID 1000 with all runtime capabilities dropped. This addresses the earlier executable `EPERM` found with the hardened container settings. Final non-serving image inspection evidence is pending coordinator completion at report draft time and must be added before closing artifact review.

Final builds resolve the pinned bases `node@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94` and `caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`, as recorded in the build logs and `base-images.log`. Final build IDs from the raw build logs:

| Target | Image ID |
| --- | --- |
| private-api | `sha256:9b797a65ea777a4f39c7e4c4ac6600076d661b7676ef7a00ddef8cd18ee2d6e2` |
| private-web | `sha256:633d964a82322eacaea6eb44a763ebb1ae47d58ebc7d7100f6455f276c685a71` |
| migrate | `sha256:7ca620629283019311bcedbc05467f9098e27b42fc9aa9913547187e1ef7762f` |

Build storage remains constrained: `image-build-disk.log` ends at 98% usage with 194 MiB available. The failed earlier build was a workspace-capacity failure. The coordinator removed only eight identified task-owned build-cache records, preserved images/volumes/databases and verified the task-owned dependency relocation. Successful builds do not establish adequate capacity for a deployment host.

## Remaining owner actions

Before a private phone exercise, supply and approve the isolated synthetic DB, immutable image record, external secret/inbox/TLS bindings, trusted certificate and the actual VPN interface/firewall boundary. Explicitly authorize any migration, optional catalogue write and service launch. Verify all-route access challenges, TLS SAN/key/dates, authenticated flows and absence of exposed API/inbox ports on that approved host. Perform the physical-phone install, standalone, reconnect/update and sign-out walkthrough. No URL or running stage is delivered by this preparation.

Backup/restore scripts and guard tests are preparation only. No real backup, restore rehearsal or rollback exercise ran. Production also needs genuine provider/data credentials and rights, operational capacity/monitoring/recovery evidence, and a separate release decision. The concrete next decision is approval of the externally supplied private-stage bindings and deployment scope, after the owner has reviewed this candidate and its remaining limits.
