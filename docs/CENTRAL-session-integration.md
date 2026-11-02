# CENTRAL session-intention repair

Base: authorized B4 integration `fc7ca19`. Implementation: `72b5c1c`, refresh-failure correction `cdbbd04`; final test-only lifecycle fixture repair `dfceb6b`. This new change is separate from the authorized B4 merges. It is not authorized for merge or production deployment.

## Root cause and behavior

Cookies are shared between tabs. Cookie-derived ownership correctly selects the currently authenticated account, but an old rendered view can still express a different account's intention when focus/broadcast notifications are missed. B4 H1/M1 already protect CSV preview, commit and withdrawal; the remaining contextual reads, settings, manual performance actions, export, account deletion and login/logout need the same boundary.

The beta identity hook now compares `X-Compass-Session-Binding` with the cookie-validated session before handlers run. Missing, stale or replaced-session bindings return `409 session_changed`; the binding never selects an owner. Login/logout also require explicit signed-out intention when no session exists. Health, authoritative session bootstrap, OPTIONS and non-cookie-changing OTP send remain narrow exceptions. All API responses retain private/no-store policy.

Rendered query/mutation closures capture an immutable origin, acquire the existing authentication Web Lock and revalidate the authoritative session after acquisition. The existing H1 helper is reused unchanged; raw history methods retain their own H1 boundary to avoid recursive lock acquisition. Dispatched requests retain the lock through response completion even if their consumer is cancelled; obsolete results are discarded. Export and retained authentication callbacks receive equivalent originating-intention protection. Browsers without Web Locks fail closed.

Independent security review found an additional edge during implementation: failed session refresh displayed a signed-out login while retaining the prior internal intention. The failure branch now clears that intention before rendering. A regression keeps A's cookie valid and verifies the displayed signed-out callback cannot issue a replacement login as A.

The H1 helper, history planner/routes, Prisma history store, shared algorithms and private UserPerformance model remain unchanged from the B4 merge. No external data access or new dependency was introduced.

## Validation and evidence boundaries

Coordinator owns one prepared workspace and a sequential PostgreSQL/browser lane; independent agents inspect source and raw logs without duplicate setup. Full API validation at `cdbbd04` passed 474/474, including the four independent CENTRAL API tests, DEMO-store and migrations. Full web at `dfceb6b` passed 106/106, shared 82/82, all-workspace TypeScript and production builds passed. `dfceb6b` only changes an existing web test fixture; API application/test content remains as tested at `cdbbd04`.

Initial API run had 470 passes/4 failures in positive fixtures lacking the new binding. Initial web run had 105 passes/1 failure because the fixture reused the pre-logout callback before a committed signed-out render. Raw failed logs are retained; fixes preserve negative and no-download assertions. Final browser evidence and independent dispositions are recorded separately after completion, without treating these initial failures as passes.

The browser gate targets this branch's API and newly built web explicitly using `B4_API_ROOT` and `B4_NEW_WEB_DIST`. The old production artifact remains B4 `1fd215c`. Real old cached assets must fail closed for unbound contextual/profile/settings/export/login and history actions. A synthetic bound session is established explicitly before loading the old authenticated shell; old login is not bypassed in application code. After real service-worker activation, current bound operations and account isolation are verified. Separate direct API coverage checks unbound signed-out login cannot consume OTP or emit cookies.

## Operational limits and next release work

Old cached clients require activation/reload before login or personal use. Deploy compatible API before or atomically with the new assets; verify real hosting HTML/worker cache headers before launch. A controlled loopback artifact host does not establish production CDN policy. Slow in-flight requests can delay account transitions until response completion; releasing the shared lock early would reopen the race.

This is a focused security PR, not a complete production approval. Next safe release work is selective integration/review of existing offline-shell and mobile-focus improvements, plus the existing strict manual calendar-date validation fix. Do not apply older release-candidate trees wholesale over H1/CENTRAL. Hosting/domain/email configuration, authorized event/results rights, live operational checks and explicit production approval remain launch gates. Do not scrape, purchase, deploy or modify production data.
