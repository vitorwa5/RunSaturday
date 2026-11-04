# Independent QA: private phone-test release candidate

Reviewed 2026-11-03; retained evidence rechecked independently 2026-11-04 after the execution session restarted. Candidate: `release/phone-test-rc` at `efce24ec39175a704bb0175806649be65257b609`, inspected in `/workspace/RunSaturday-rc`. Raw execution evidence: `/workspace/RunSaturday-release-next-evidence`. This report reviews source and coordinator-generated artifacts independently; the QA reviewer authored regression tests and fixtures, not the application or deployment implementation.

**APPROVE the reviewed source and private-staging preparation for owner review. BLOCK complete artifact qualification: the migration image CLI could not be executed within available Docker storage. The successful final image builds were subsequently removed locally to recover space; their IDs/logs remain, not an installed deployable set. The earlier `2ca7c2c` image set is rejected for non-root readability. REJECT a claim that this is already deployed, real-phone validated, production ready or authorized for deployment.** No merge or deployment is authorized by this QA disposition. PR 7's previously authorized merge does not authorize merging draft PR 8. Runtime artifact inspection is recorded below; external host, database and device validation remain separate gates.

## Execution evidence

| Check | Actual result and evidence |
| --- | --- |
| Database-backed API | Fresh idle run: `validated-nov4/api.json` independently inspected, success=true, 478 passed, 0 failed, 0 pending, all 478 assertions passed; `api.exit` = 0. Includes migration integration, Saturday DEMO, performance/date validation and private-history coverage. One worker, unchanged default timeout; exact `edc7cde` Git clone, whose application/test/lock tree equals final `efce24e` |
| Web unit suite | `web.log`: 117 passed across 14 files |
| Shared suite | `shared.log`: 82 passed across 6 files |
| Typecheck / application build | `typecheck.log`, `build.log`, `private-web-build.log`; `final-build.exit` = 0 |
| Release guards | Independently rerun November 4 against `13300c3`: direct `node` execution of operations/private-import/private-staging tests yields 2 + 5 + 5 = 12 passed, zero failed/skipped; every command exits 0. Raw `final-nov4/independent-guards.log`; local fake-client/stub-process tests, not a live staging DB exercise |
| Built PWA | `pwa-browser.log`: 9 passed in 20.1 s, three cases at each Chromium-emulated width 360/390/430 |
| DEMO browser suite | `browser-demo.log`: 195 passed in 5.4 min, including six new mobile navigation/product-matrix cases |
| Auth/beta browser suite | `browser-auth.log`: 117 passed in 4.7 min |
| Old-worker/new-API upgrade | `browser-cache.log`: 1 passed in 6.3 s; real old/new worker lifecycle and bound private import |
| Combined browser lane | `browser.exit` = 0; use the actual suite counts above, not a pre-run estimate |
| Production dependency audit | `dependency-audit-final.json`: 0 vulnerabilities |
| Full development dependency audit | `dependency-audit-all.json`: 10 entries, 8 moderate and 2 low; 0 high/critical. Remaining chain is build tooling through vite-plugin-pwa/workbox-build, glob/minimatch, EJS/Jake/filelist, deepmerge and Rollup helpers. This is an explicit residual build-time risk, not a zero finding |
| Synthetic catalogue preparation | `staging-dry-run.json`: 2 records, `databaseContacted:false`; `staging-catalogue-dry-run.json` labels fictional locations and contains no historical results/scores |
| Earlier container builds | `image-builds.exit` = 0 at `2ca7c2c`; subsequent non-root inspection exposed an actual file-permission failure. Successful builds alone did not qualify those images. The subsequent `edc7cde` API/web builds succeeded, but its API probe retained optional vite/vitest peers and its migration build exhausted storage. Final `efce24e` API/web/migrate builds succeed (`validated-nov4/last-build.exit` = 0). API UID1000/runtime DEMO smoke and Caddy configuration validation pass; actual migration CLI execution is BLOCKED by Docker ENOSPC. Generated final images were removed after recording evidence; no installed final image set is delivered |

Evidence retention limitation: the restart cleared `/tmp/compass-preserved-evidence`; `api.json`, `api-initial-failed.json` and `pre-prisma-api.json` are broken symlinks. Their corresponding `.log` files survive, but the original JSON data and its detailed API assertions do not. A fresh full API run now supplies independently inspectable replacement evidence at `validated-nov4/api.json`. This review does not silently treat the missing JSON as present or claim the prior workers remain active. The restart reruns were preserved: `resume-nov4/api-initial-no-git-json` reports 477/478 because the initial archive lacked required Git history; `resume-nov4/api.json` reports 477/478 because one Saturday DEMO case exceeded the unchanged 5-second limit while Docker work competed. The final full run after Docker work stopped passes 478/478 with the same default timeout. These failures are retained rather than overwritten. The retained browser, unit, build, guard, audit and dry-run files were read again on November 4; their documented counts/results match the surviving files. No database or browser rerun was performed by this reviewer after restart. The reviewer did independently rerun the 12 local guard checks, with results recorded above.

The initial PWA attempt is retained in `pwa-browser-initial-failed.log` (6 pass, 3 fail). Those three failures were the uppercase test expectation for the lowercase public CSV provenance enum. A further test correction observes the current account through the actual Profile flow. QA-only corrections `6c5feac`/`0a4c913` (candidate cherry-picks `7ddea2c`/`07d0baf`) precede the final passing run; the initial evidence was not overwritten. Initial API logs and dependency/build evidence are retained separately; the missing older API JSON files are disclosed above. Current passing evidence supersedes those earlier runs only for the tested behavior.

The Dockerfile changes followed the browser runs and affect packaging: shared install/build step with package cache excluded from image layers, offline pruning, minimal runtime copy, and OpenSSL 3 detection for Prisma. Independent `git diff --name-only 07d0baf HEAD` lists only `Dockerfile`, so the application, browser tests and lockfile are unchanged since the reviewed browser candidate. The application and lockfile are unchanged between tested `2ca7c2c` and `13300c3`; `edc7cde` changes Dockerfile permissions, and `13300c3` adds `--omit=optional` to offline production pruning. The migration stage retains the complete build tree. `efce24e` additionally replaces the migration WORKDIR layer with a fixed shell entrypoint: `cd` to the same directory then `exec` Prisma with quoted positional arguments. The constant shell script does not evaluate supplied argument contents; `prisma` is the shell argv0, preserving Docker CMD forwarding. Private compose replaces this entrypoint with the unchanged guarded Node wrapper. Final runtime results are recorded below. An actual staging session has not been exercised through those images.

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

The private Caddy variant removes the inherited privileged-bind file capability and runs as UID 1000 with all runtime capabilities dropped. This addresses the earlier executable `EPERM` found with the hardened container settings. Non-serving inspection of the earlier API image then exposed `EACCES` reading `/app/scripts/release/private-api.mjs` as UID 1000 (`api-image-inspection-initial-failed.log`, diagnostic `api-image-inspection.log`). `edc7cde` normalizes public source/configuration with `chmod -R a+rX /app` before installation and copies both Caddyfiles as mode 0644. The build context excludes secrets; external runtime secrets are not widened by this fix. The November 4 `edc7cde` API probe confirms the bundled server and private gate are readable at UID 1000, but also exposed retained optional vite/vitest peers. `13300c3` removes optional peers from the API runtime dependency tree.

The final `validated-nov4/api-image-inspection.log` confirms UID 1000, mandatory Fastify/Zod/auth/client/adapter/pg packages, OpenSSL 3.0.22, readable bundle/private gate and refusal without required settings; Prisma CLI, vite, vitest, jsdom, workbox-build and concurrently are absent. `api-demo-runtime.log` runs the actual bundled synthetic DEMO server successfully at UID 1000, with no database binding or published port. `caddy-final-validation.log` records valid configuration under hardened non-root settings using short-lived synthetic TLS fixtures; this is configuration validation, not a serving TLS/basic-auth session. The migration image builds, but its actual default-entrypoint run initially fails in Docker with ENOSPC and remains an explicit BLOCKED gate. The coordinator stopped further Docker attempts after task-owned cleanup; it did not weaken restrictions or reset the daemon. All generated final image tags were removed to recover capacity, while successful build/inspection logs and image identities remain.

`staging-guards-final.log` reports file-level passes under the Node 24 runner. The follow-up `staging-guards-final-direct.log` executes all three files directly and records 2 + 5 + 5 = 12 passing individual tests, zero failures. The independent November 4 direct guard rerun also passes all 12 cases. No new application tests are claimed for a Dockerfile-only change.

Earlier builds resolve the pinned bases `node@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94` and `caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`, as recorded in the build logs and `base-images.log`. Earlier build IDs from the raw build logs (superseded, not approved for deployment):

| Target | Image ID |
| --- | --- |
| private-api | `sha256:9b797a65ea777a4f39c7e4c4ac6600076d661b7676ef7a00ddef8cd18ee2d6e2` |
| private-web | `sha256:633d964a82322eacaea6eb44a763ebb1ae47d58ebc7d7100f6455f276c685a71` |
| migrate | `sha256:7ca620629283019311bcedbc05467f9098e27b42fc9aa9913547187e1ef7762f` |

Final `efce24e` image identities are recorded in `validated-nov4/images.json`; every image revision label is the full candidate SHA. These are historical local image IDs, not registry RepoDigests; the generated images have been removed locally and must be rebuilt or supplied before an eventual launch:

| Target | Final image ID |
| --- | --- |
| private-api | `sha256:d01ead1371ac23ad19858578c33dcff06b2afb4701d7347f507ef3bb6e347e41` |
| private-web | `sha256:2b5e37f959590c534326b7dc659f086ffa594e51460d29f6929cc3657dbbbae8` |
| migrate | `sha256:3aa71274a6841925461b2c083f38306234df15ba7642e6baf22140e01af36fe5` |

Builds also emit engine warnings for development tooling requiring Node 22.22.2 or newer while the pinned image uses 22.22.0; completing the build does not remove that declared compatibility mismatch.

Build storage was constrained in the prior session: `image-build-disk.log` ends at 98% usage with 194 MiB available. The failed earlier build was a workspace-capacity failure. That earlier cleanup removed eight identified task-owned build-cache records and verified task-owned dependency relocation. November 4 cleanup subsequently removed exact task-owned images/cache records to recover space; final image tags are absent as disclosed above. No database/volume removal or migration occurred. Successful builds do not establish adequate capacity for a deployment host.

## Remaining owner actions

Before a private phone exercise, resolve the migration runtime/artifact blocker and obtain a complete qualified immutable image set. Supply and approve the isolated synthetic DB, immutable image record, external secret/inbox/TLS bindings, trusted certificate and the actual VPN interface/firewall boundary. Explicitly authorize any migration, optional catalogue write and service launch. Verify all-route access challenges, TLS SAN/key/dates, authenticated flows and absence of exposed API/inbox ports on that approved host. Perform the physical-phone install, standalone, reconnect/update and sign-out walkthrough. No URL or running stage is delivered by this preparation.

Backup/restore scripts and guard tests are preparation only. No real backup, restore rehearsal or rollback exercise ran. Production also needs genuine provider/data credentials and rights, operational capacity/monitoring/recovery evidence, and a separate release decision. The next release step is to close the blocked migration-artifact check with adequate build/runtime storage, then review the externally supplied private-stage bindings and deployment scope.
