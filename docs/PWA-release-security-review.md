# PWA, manual dates and private staging security review

Base: owner-authorized CENTRAL merge `aa9b3e5`. Final implementation heads and runtime disposition pending. This reviewer authors only this document, independently inspects implementation and raw evidence, and does not implement application or test changes. No merge, deployment, public launch or production approval is implied.

## Initial selective-reuse audit

Old offline-shell candidate `9f1ae8e` cannot be applied unchanged. Its `finally` opens children after `await refresh()` irrespective of authoritative validation. CENTRAL's existing void refresh resolves after caught errors, skipped busy/remote-transition checks and stale/aborted checks. Therefore promise completion alone cannot release the offline barrier. Its async event listener also lacks a rejection handler. Guidance sent before implementation: let the authentication provider own online/readiness state; hide personal UI and invalidate its epoch/cache on disconnect; permit only a successful current authoritative refresh to restore readiness; retain a blocking error/retry shell on failure; recover skipped checks after transitions finish. Offline invalidation must preserve CENTRAL's lock through already-dispatched response completion.

Required race coverage includes failed reconnect, refresh skipped during busy/remote transition, online/offline/online response reordering, session replacement while offline, and absence of stale personal controls/data after reconnect. Keep immutable session origins, failed-refresh intention clearing, H1 post-lock revalidation and response lifetime unchanged. Conservative API `cache: no-store` can supplement server private/no-store headers; the service worker must cache only public shell assets and never API responses or personal data.

Old mobile-focus candidate `30a3bff` adds a focusable main region and focuses it after pathname navigation. Its application change is small and does not require replacing auth/query source. It still requires final source and test inspection.

Manual-date candidate `2ee408d` adds a finite parse guard before `toISOString`; invalid month/day components otherwise throw before producing the intended 400. Exact UTC calendar roundtrip rejects normalized invalid dates while retaining valid leap dates. Future comparison remains against `ctx.today()` in `APP_TIME_ZONE`; manual dates remain date strings rather than browser-local timestamps. Suggested coverage: valid 2000/2024 leap days, invalid 2100/non-leap February, no create/edit mutation on rejection, and application-timezone midnight boundaries. H1/M1 planners and cookie-derived account ownership must remain untouched.

## Private staging preparation boundaries

Old host-neutral packaging `2332cbe`/`bcf381b` and offline prune `cf3e4b8`/`6444038` require selective review. The old production compose publishes ports 80/443 on all interfaces and assumes real email delivery; it is not a private test-OTP staging configuration. Production remains beta/database/HTTPS with real email and must reject test delivery. A separate staging configuration can explicitly use `NODE_ENV=test`, `APP_MODE=beta`, `EMAIL_TRANSPORT=test` over private HTTPS, with loopback/VPN/admin access enforced across every route including API. It must not expose an OTP endpoint or relax production validation.

Existing test delivery creates an append-only operator inbox with mode 0600 only when new; it does not tighten permissions of an existing file. Prepare its external directory as 0700 and file as 0600, owned by the API runtime UID. Keep it outside the checkout/build context, image, web root, logs and shared artifacts, with only the narrow directory mounted. Old ignore patterns do not generally exclude every potential inbox JSONL file. Use synthetic users and explicitly authorized synthetic catalogue data only. No deployment, actual OTP retrieval or runtime infrastructure action is performed by this reviewer.

## Final review

### Blocking: expiry event bypasses reconnect validation (`a24004e`)

`AuthProvider`'s `onExpiry` advances the epoch and unconditionally sets `ready: true`, while `OfflineGate` releases its children whenever online and ready. On reconnect, an HTTP 401 from `/account/session` causes `apiGet` to dispatch `compass-session-expired` before throwing. The event invalidates the refresh ticket and opens the gate as signed out; the catch then sees a stale ticket and cannot show the session-check failure. Likewise, an unsignaled, already-dispatched history or authentication write can deliver a delayed 401 or `session_changed` response after reconnect, abort a pending authority check, and open the gate without successful current validation. The in-flight write must retain its lock through response completion, so suppressing its response by aborting it is not a safe fix.

Keep the reconnect barrier closed through expiry events and arrange a fresh authoritative session check after any active write completes. Cover both a reconnect session 401 and a delayed unsignaled write error across offline/reconnect with a deferred successful session response. Require the gate to remain closed until that response succeeds and preserve a retryable failure on failed validation.

The corrected PWA head `369cda6` adds a synchronous validation-required barrier initialized at bootstrap and set on disconnect, reconnect and failed checks. While that barrier is set, expiry events leave the gate closed and do not invalidate the session check queued behind the complete write response. Only a current successful session result clears the barrier. Added real-client coverage exercises bootstrap/reconnect 401 and delayed unsignaled 401/409 responses with a serialized lock and deferred subsequent session response. Static inspection finds the reported bypass addressed; independent final disposition still requires coordinator-owned raw verification of the exact integrated tree.

Manual-date head `7b2e8f8` contains `afdef6c`: the finite parse guard precedes `toISOString`, while exact calendar roundtrip and existing ownership handling remain in place. Focus change `a24004e` adds a focusable main region and skip link. Both require final integrated test evidence.

Staging preparation is still in progress. A VPN address declared by an operator is an assertion requiring independent network/interface verification before use, not proof of isolation. No runtime or deployment is authorized by this review.
