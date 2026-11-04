# Phone-test candidate validation

This candidate follows the authorized CENTRAL integration into main (`aa9b3e502421acf9ce5bf5152ab30933e850f8c1`). PR #8 contains reviewable changes; no later main merge or deployment is authorized or performed.

## Disposition

**BLOCKED for integration/complete artifact qualification. PR #8 merge recommendation: REJECT until the missing gate is executed.** Independent QA (`a28567a7f64e6fefb5497d2a173466a6203a9258`) and security (`a1665a9a38507c5368cc808c07c52a5c5fbe320d`) approve source/private preparation at `efce24ec39175a704bb0175806649be65257b609`, while explicitly retaining the missing migration CLI check. The final full API rerun passed all 478 assertions. PR #8 remains draft; do not merge or deploy on this evidence alone.

[Independent QA](phone-test-rc-independent-qa.md) and [security review](PWA-release-security-review.md) distinguish actual successful checks from unexecuted phone/host/production gates.

## Changes

- Offline/reconnect and failed-bootstrap screens hide personal history until an authoritative current session check succeeds. Late expiry responses cannot release this barrier; personal request transport uses no-store. Reviewed B4 H1, M1 and CENTRAL session ownership protections remain intact.
- Mobile navigation moves keyboard/screen-reader focus to the new main landmark and provides a skip link without stealing search focus.
- Manual performance dates reject invalid calendar components without throwing a server error; leap-year, strict format, local-midnight and unchanged-record regressions cover create/edit behavior.
- Private phone preparation supplies guarded synthetic-only database/import/migration operations, all-route access control, trusted private HTTPS bindings, operator-only OTP access and recovery instructions. The optional two-event synthetic catalogue contains no results, scores or rankings and has only been dry-run.
- Compatible dependency patches and separate non-root API/web/migration images are included. API pruning omits unused optional test/build peers; the migration image retains its CLI. Public source/configuration permissions are normalized for non-root readers. Migration CLI cwd is set at exec time while preserving literal arguments, avoiding a redundant filesystem layer.

The complete product coverage matrix is in [release-readiness-matrix.md](release-readiness-matrix.md). Independent QA and security reports qualify their scope separately; a review recommendation is not production approval.

## Test evidence

Raw evidence is retained outside the checkout at `/workspace/RunSaturday-release-next-evidence`. The validation manifest records exact source revisions and hashes without committing credentials or raw auth logs.

| Check | Result |
| --- | --- |
| Full API, DEMO-store, actual clean/upgrade migrations | 478 passed, zero failed/pending; idle recovery run exit 0 |
| Web Vitest | 117 passed |
| Shared Vitest | 82 passed |
| Independent local staging guards | 12 passed, direct sequential Node invocations |
| General DEMO/mobile Playwright | 195 passed |
| Authenticated Playwright including CENTRAL/B4 | 117 passed |
| Real built-worker PWA at 360/390/430 widths | 9 passed |
| Old cached-client upgrade | 1 passed |
| TypeScript and API/web builds | Passed; final images rebuild the application |
| npm audit production graph | Zero vulnerabilities in recorded audit |
| Complete dependency audit | 10 entries: 8 moderate, 2 low; no high/critical |
| Final images and runtime inspections | All three built; mandatory API graph, isolated DEMO and restricted Caddy passed. Migration CLI could not start: ENOSPC |

The browser run tests the application/test/lock tree preserved since `07d0baf`; subsequent source changes are confined to Dockerfile. Private built asset names and nine precache entries match the final builds. The fresh API recovery clone uses exact `edc7cde` with real Git history; its application/test/lock tree is identical to final packaging source. Independent reviewers inspect the raw evidence rather than accepting developer assertions.

## Failed attempts and environment recovery

Earlier failures are retained and are not counted as passing: shared-public-fixture assumptions in the seed guard (repaired with owned migrated-schema isolation); PWA fixture DTO case and identity locator mistakes (test-only corrections); inherited Caddy file capability and mode-600 public-source readability; optional peer tooling retained by initial production pruning; VFS capacity failures; an unsupported Docker export route; an archive-only API test clone lacking historical Git metadata; one unchanged five-second Saturday test timeout during concurrent heavy image build; and a DEMO smoke fixture expecting `demo` instead of the existing `demo-memory` health contract. The corrected fixture passed. The idle full API recovery run then passed 478/478 with unchanged default timeouts.

The Nov4 executor restart cleared `/tmp`, including the original raw API JSON and disposable dependencies. Previous API counts therefore require the fresh recovery run. Other raw logs remained. No source commit was lost or restarted. Successful efce image IDs remain recorded, but those task-owned generated tags/cache records were removed locally after the failed VFS run exhausted storage; they are not an installed or published deployable set. No staging database operation was performed. Original shared dependencies were byte-verified and archived before relocation; only generated, explicitly identified task-owned images/cache records were reclaimed. No database/volume cleanup, reset or destructive seed was performed.

The coordinator prepares dependencies/PostgreSQL once and owns the shared validation lane. Check the existing database is healthy before any database test. Run one Vitest worker and serialize heavy image builds, database/browser suites and final evidence generation. Review agents may run local mocked guard checks; they do not install packages, start databases or request duplicate permissions. Persist evidence in the workspace, independently of disposable caches.

## Remaining gates

Before a private phone exercise: owner-approved isolated synthetic database, private interface/firewall/VPN boundary, trusted certificate and secure external environment/inbox bindings, followed by explicit deployment/migration approval. No private URL or service is currently provided. Real-device install, standalone/basic-auth behavior, screen-reader use, TLS/access-barrier smoke tests and backup/restore rehearsal remain unexecuted.

Before public launch: authorized sustainable event/results sources and their permitted uses; final domain, email provider and hosting/database credentials; production monitoring/recovery and capacity evidence; a separate production approval. Missing real historical evidence remains unavailable. DEMO/synthetic results do not establish real ranking validity. Map/saved-event integrations remain labelled reserved features; they are not completed integrations.

The full development audit retains bounded Workbox/glob/minimatch/deepmerge build-tool findings. Pinned Node22.22.0 builds currently emit engine warnings for dev tools requiring a newer Node patch; those tools are excluded from the final API but remain in migration/build tooling. The next independent development task is validating a supported patched base image and reviewing this toolchain graph. No OS vulnerability scan or physical-phone validation is claimed.

## Next executable task

Provide a supported executor with sufficient Docker/VFS capacity (recommend at least 16 GB of workspace/container disk), preserving these branches and worktrees. Rebuild the exact reviewed packaging source, verify UID/revision labels, execute default and explicit migration CLI `--version` with network disabled and no database binding, and obtain renewed independent artifact qualification. Do not change Docker storage/security settings or reset unrelated resources merely to make this check fit. Then review a supported patched Node base and repeat the relevant packaging/toolchain checks. Private phone deployment still requires the separate owner-supplied bindings and approval listed above.
