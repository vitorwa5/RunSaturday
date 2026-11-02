# B4.1 H1 independent security review

Verdict: **APPROVE H1**, scoped to commit `8bb4fdf` relative to PR #4 base `69d7289`. No blocking security findings identified in this change. This is an independent review of the implementation, not an approval to merge, deploy, or change production data.

Reviewed source in `/workspace/RunSaturday-b41`; this document is maintained separately on `review/release-security`. No application changes were authored by this reviewer. Repository `AGENTS.md` and the assigned security reviewer role were read.

## Evidence

| Requirement | Evidence at reviewed commit | Assessment |
| --- | --- | --- |
| Share the authentication lock | `apps/web/src/auth/historyOperation.ts:22-39` calls `withAuthLock`; `apps/web/src/auth/epoch.ts:35-40` requests exclusive `5k-compass-auth`, also used by `AuthProvider.tsx:67-89`. | History and account cookie changes serialize on the same browser lock. |
| Revalidate after acquisition | `historyOperation.ts:23-35` checks ticket at callback entry, fetches authoritative session, rechecks ticket, then checks mode, owner, binding, exact expiry, and finite future beta expiry before dispatch. | Queued A work rejects B and a replacement session for the same A. Cancellation cannot bypass callback checks. |
| Capture queued origin | `historyOperation.ts:12-14` copies identity scalars; `hooks/queries.ts:121-131` stores origin and dispatch closure in mutation variables; `HistoryImportPage.tsx:18-21` closes over the originating render for preview. | Later renders cannot replace the queued session or mutation dispatch binding. |
| Keep lock through dispatched history request | `historyOperation.ts:35-38` awaits dispatch before checking the epoch again; preview passes `undefined` signal at `HistoryImportPage.tsx:21`; commit/withdrawal dispatch without a signal at `queries.ts:124`. `api/client.ts` awaits response body parsing. | Account epoch cancellation suppresses stale results without aborting the dispatched request and prematurely releasing the lock. |
| Avoid nested lock deadlock | Endpoint functions only invoke `apiSend`; expiry handling resets state synchronously and broadcasts. Refresh queues a lock asynchronously without being awaited by history dispatch. | No inner awaited acquisition of the same exclusive lock found. |
| Fail closed without Web Locks | `historyOperation.ts:39` requires cross-tab locking; `epoch.ts:39` throws before invoking action when unsupported. | No session or history request dispatch through this helper in an unsupported browser. |
| Preserve backend precondition (M1) | `git diff --name-only 69d7289 8bb4fdf -- apps/api packages` returned no changes. Inspected `apps/api/src/history/routes.ts:11-19` and `auth/http.ts:39-44,58-64`. | Cookie-derived ownership and session-binding rejection remain intact. Client binding remains a precondition, never an identity selector. |

The backend disables session refresh (`apps/api/src/auth/auth.ts:47`), so comparing the exact expiry does not reject a normal rolling refresh introduced by this change. The post-lock session check and history request have no intervening await after the final ticket check. Backend expiry validation remains authoritative if the expiry boundary is crossed immediately afterward.

## Validation and limits

Executed by this reviewer in the implementation worktree:

```text
npm test -w @runsaturday/web -- --maxWorkers=1 src/__tests__/historyLock.test.ts src/__tests__/historyLifecycle.test.tsx
2 files passed; 13 tests passed (12 history-lock cases and 1 lifecycle case).

git diff --check 69d7289 8bb4fdf
Passed, no output.
```

The 12 helper cases cover six delayed-acquisition replacements, three retained-lock completions after epoch cancellation, ignored queued AbortSignal, unsupported locks, and cancellation during session revalidation. Their operation names all exercise the same helper; these cases alone do not prove the three concrete UI call sites. Those call sites were inspected independently above.

The browser regressions in `e2e/historyLock.spec.ts` cover preview, commit, and withdrawal under both A-to-B and same-A replacement sessions, with notification/focus recovery suppressed, and assert no history request and unchanged private database rows. `e2e/historyImport.spec.ts` additionally checks that logout stays queued until delayed preview/commit/withdrawal responses complete. These tests are inspected evidence until executed in the coordinator's exclusive database/browser lane; no browser or API pass is claimed here yet.

This scoped approval addresses coordinated application requests and ordinary response completion. It does not claim browser locks provide server transactions across browser crashes or transport failure, or review unrelated auth/backend changes. No provider access, production data access, merge, or deployment was performed.
