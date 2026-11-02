# B4.1 H1 independent QA

Reviewed on 2026-11-02. Target: `8bb4fdf78872344a223110e3c8f84e9db20029f4`
on `fix/b4-history-session-reimport`, based on PR4 head `69d7289`.
Scope: H1 history/authentication lock coordination only. This review does not
reopen B4 or change M1 replay behavior.

**APPROVE for H1 at exact application/test commit `8bb4fdf`.** No blocking
defect found. This is scoped QA approval, not authorization to merge or deploy;
independent security review remains a separate integration requirement.

## Independently executed evidence

In `/workspace/RunSaturday-b41`:

```sh
npm test -w @runsaturday/web -- --maxWorkers=1 src/__tests__/historyLock.test.ts src/__tests__/historyLifecycle.test.tsx src/__tests__/authLifecycle.test.tsx
```

PASS: 3 files, 29 tests; exit 0, duration 2.56 seconds. QA made no application
or test changes. Dependencies were the coordinator-provided `node_modules`
symlink. QA did not install dependencies or run database/browser processes.

## Source and assertion review

- Preview calls `withHistorySession` in `HistoryImportPage.tsx:21`. Commit and
  withdrawal enable the history path in `hooks/queries.ts:152-158`, whose
  mutation captures the originating identity and dispatch function at invocation.
- The helper uses the existing `withAuthLock`; `epoch.ts:37` names the same
  `5k-compass-auth` Web Lock used by authentication transitions. It requires
  cross-tab support and fails before session/history access when unavailable.
- Inside the acquired lock, the helper validates ticket freshness, obtains the
  actual `/account/session`, then compares mode, user ID, session binding and
  expiry against the captured origin. Same-user replacement sessions fail the
  binding comparison. Invalid/expired beta sessions also fail closed.
- There is no asynchronous gap between the final freshness check and dispatch.
  History dispatch receives no epoch AbortSignal. The helper awaits its entire
  promise before releasing the lock, then rejects stale results. Thus auth
  cancellation invalidates publication while an already-dispatched operation
  retains the lock until its response is consumed. No nested lock acquisition
  appears in the history dispatch call graph.
- Unit tests actually delay lock acquisition, substitute B or a new A session,
  and assert no history dispatch. They also cancel during session validation
  and after history dispatch, assert queued auth work remains blocked until
  completion, and verify unsupported-browser fail-closed behavior. The three
  operation labels repeat the same helper exercise; they are not three real
  call-site integration tests.
- `e2e/historyLock.spec.ts` supplies the meaningful real call-site matrix:
  preview/commit/withdrawal by B/new-A replacement. It blocks the real shared
  lock, suppresses notifications, confirms the operation is queued, changes
  the cookie under the lock, proves the binding changed, and checks zero
  history requests plus unchanged user-performance records after release.
- The delayed-response cases in `e2e/historyImport.spec.ts` cover all three
  operations, confirm logout stays queued while the response is held, and
  verify B receives neither A's rendered result nor A's history records.

## Additional useful cases

These are nonblocking coverage improvements, not observed defects:

1. Reject the session read and history dispatch separately, then prove queued
   auth work runs, explicitly covering lock release on failure paths.
2. Assert a valid matching session dispatches once, returns its result and
   releases the queue; test expiry-only mismatch and missing binding directly.
3. Exercise the real commit/withdrawal hooks across an auth rerender to prove
   the captured dispatch cannot adopt the replacement render's binding.

## Coordinator-executed evidence independently inspected

The coordinator owns the sole database/browser lane. QA read the final logs in
`/workspace/RunSaturday-b41-evidence/`; these are not QA-executed commands:

- `api.log`: `npm test -w @runsaturday/api -- --maxWorkers=1 src/__tests__/auth.test.ts src/__tests__/historyPlanner.test.ts src/__tests__/userPerformance.test.ts`
  passed 3 files / 52 tests.
- `browser.log`: `npm run test:e2e:auth` passed all 60 tests in 2.7 minutes,
  using one worker and 360/390/430 widths. This includes all 18 H1 queued
  operation/session cases, all 9 delayed-response cases, stale-tab cases and
  existing auth/import/onboarding journeys. The coordinator confirmed final
  exit 0. Browser launch setup was coordinator-owned; QA did not independently
  launch or inspect the browser executable.
- `typecheck.log` and `build.log`: all workspace type checks and builds completed
  successfully. The web build emitted a nonblocking chunk-size advisory.

QA independently confirmed the B4.1 checkout remained at `8bb4fdf` with no
tracked source/test diff. The coordinator confirmed later changes are docs only.
Playwright reports transformed source line offsets; those do not imply source
drift. M1 planner/replay implementation is absent from this H1 diff; the
coordinator's relevant existing API regressions passed without changing it.

## Evidence boundary

This approval combines independent source/assertion review and the independently
executed targeted web tests with the explicitly attributed coordinator logs.
No merge, deployment, production database access, or external messaging occurred.
