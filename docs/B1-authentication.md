# B1: authenticated accounts and personal data

B1 introduces passwordless email accounts without changing any running, challenge or Saturday mathematics. Real event ingestion and geography/travel changes belong to B2 and later phases.

## Modes and startup

`APP_MODE` is mandatory and independent of `DATA_SOURCE`:

- `APP_MODE=demo`: deliberately shared fictional `demo-user` and deterministic history; either the memory store (`DATA_SOURCE=demo`) or the seeded development database. Never use this mode for real accounts. `npm run dev:demo` supplies both flags.
- `APP_MODE=beta`: PostgreSQL only, verified email and server sessions. Missing auth/delivery configuration or B1 database tables stops startup. Every public beta requires HTTPS, even when `NODE_ENV` is omitted. `NODE_ENV=production` also requires beta mode. There is no demo fallback, including when a database or session lookup fails.

For a beta/production deployment, set these variables through the deployment's secret/configuration manager:

```text
APP_MODE=beta
NODE_ENV=production
DATA_SOURCE=database
DATABASE_URL=<PostgreSQL connection string>
AUTH_BASE_URL=https://<public-frontend-origin>
AUTH_SECRET=<cryptographically random secret of at least 32 characters>
EMAIL_TRANSPORT=resend
EMAIL_API_KEY=<Resend API key>
EMAIL_FROM=<sender on a verified Resend domain>
CORS_ORIGINS=https://<public-frontend-origin>
```

Keep `/api` and the frontend on the same public origin. Proxy `/api` to Fastify and terminate HTTPS at that origin. Set `HOST`/`PORT` for the actual service topology. Cross-origin cookie clients are not supported. The auth base URL is configuration, never inferred from a supplied Host header. Generate a strong secret outside source control; never use test fixture secrets in a deployment.

Local HTTP requires an explicit `AUTH_ALLOW_INSECURE_LOCAL_HTTP=true` (default: `false`) and an `AUTH_BASE_URL` with an exact loopback hostname: `localhost`, `127.0.0.1` or `[::1]`, without URL credentials. Private-network addresses and hostname suffix matches are not accepted. This exception is forbidden in production. HTTPS beta always uses Secure cookies regardless of `NODE_ENV`; only the explicit non-production loopback HTTP exception uses insecure cookies. The auth browser test server opts into this exception.

Bootstrap with `npm run db:deploy -w @runsaturday/api`, then start the built API and serve the web build. Do **not** run `db:seed` or `db:reset` as beta bootstrap. The demo seed requires `APP_MODE=demo`, non-production `NODE_ENV`, and explicit `ALLOW_DESTRUCTIVE_DEMO_SEED=true` before creating a database client. Before any deletes it checks that the database contains only the known `demo-user` fixture (no email/verified identity), with no `Account`/`Session` rows or IMPORTED catalogue Events. Imported catalogue data also refuses the seed even before the first real account exists. Any other user or failed inspection refuses the seed without deleting data. Stop application writers when reseeding a disposable development database; this is never a beta bootstrap command. The migration is additive: legacy demo rows keep null email, `emailVerified=false`, and their ownership. Demo rows never become real identities.

The test transport requires `NODE_ENV=test`; real beta/development and production require Resend configuration. Integration tests inject an in-memory delivery implementation. Browser tests use `OTP_TEST_INBOX_PATH`, an opt-in file inbox created with mode 0600 under `/tmp`. There is no HTTP inbox endpoint and codes are never logged. This transport is for tests only; remove its file after testing. No external emails are sent by the test suite.

## Identity and passwordless flow

Better Auth 1.7.7 supplies the maintained email-OTP plugin, secure code generation/hash verification, atomic single-use consumption, Prisma adapter and opaque session machinery. The existing `User.id` remains the immutable personal-data owner; verified normalized email is the passwordless identity. The adapter maps Better Auth's `name` field to existing `User.displayName`.

1. `POST /api/auth/email-otp/send-verification-otp` accepts only `{email}`. Trim/lowercase/email validation occurs before auth; the server supplies the sign-in purpose.
2. A six-digit code expires after five minutes, is stored hashed, and is replaced on resend. After five incorrect attempts the code is unusable. Atomic consumption prevents replay, including concurrent verification.
3. `POST /api/auth/sign-in/email-otp` accepts only `{email, otp}`. Verification creates an empty user or resolves the existing internal ID, marks email verified and creates a fresh session. No client-selected owner, display name, demo flag or initial history is accepted.
4. The HTTP adapter forwards the cookie and returns `{success:true}`; Better Auth's raw token/user response is not exposed. Other Better Auth endpoints, including code lookup, password sign-in, identity changes and arbitrary account operations, are not mounted.

Email delivery is a small `EmailDelivery` interface. The Resend implementation uses its fixed HTTPS API with a 15-second timeout and no provider-detail logging. Better Auth catches email-task errors internally, so a request-local delivery result lets the HTTP boundary return a safe 503 and remove the undelivered verification record. A configured provider's actual domain/key/delivery still needs deployment validation.

Login protections remain enabled in tests: database-backed per-IP limits (30 requests per 60 seconds globally, 10 per OTP route), plus atomic per-normalized-email limits shared across IPs (five sends and fifteen verifications per ten minutes). Fastify `request.ip` is authoritative; client-supplied auth IP headers are replaced. By default no forwarded header is trusted. Behind a reverse proxy, set `TRUSTED_PROXY_CIDRS` to a comma-separated list of the actual immediate proxy IP addresses/CIDRs (for example `10.50.0.4/32,2001:db8:50::4/128`, replacing these examples with deployment addresses). Fastify walks the forwarding chain only through these trusted peers. Hostnames, hop counts, wildcards and `/0` trust-all ranges fail configuration validation. IPv4-mapped IPv6 ranges that cover all IPv4 peers (including `/96`), and range unions covering both endpoints of an address family, also fail closed. Normal IPv4-mapped trusted subnets remain supported. Restrict direct backend access and configure the proxy to replace/append forwarding headers correctly; do not trust a broad shared client network. An untrusted peer cannot spoof its IP with `X-Forwarded-For`.

Product email limits live in `EmailAuthBudget`, independently of Better Auth's `RateLimit` cleanup. A unique key per email/action, atomic PostgreSQL upsert and fixed `windowStartedAt`/`expiresAt` preserve the full 600-second window, including across processes and concurrent requests. Failed/blocked attempts do not extend the window. Request-driven cleanup deletes only expired product windows through the `expiresAt` index; account deletion removes matching email budgets explicitly. Budgets can exist before a User exists, so there is no User foreign key. The additive migration preserves surviving, unexpired email budgets from the old table; Better Auth continues to own its separate IP limits.

## Sessions and request ownership

Session tokens are opaque, signed by the library and stored in PostgreSQL. The browser holds only an HttpOnly, SameSite=Lax, Path=/ cookie with a seven-day lifetime; every HTTPS beta adds Secure and the `__Secure-` prefix. There is no localStorage bearer token and cookie/session caching is disabled. Every request checks the server session and a verified, non-demo internal User. B1.1 explicitly disables session refresh: database expiry, cookie maximum lifetime and the frontend timer all use a fixed seven-day lifetime from issuance. Activity does not extend it, including internal session lookups. At expiry the server rejects the session, the browser cookie expires and the frontend clears personal state; signing in again creates a fresh lifetime. A successful sign-in rotates to a new token and revokes the session cookie it replaced; independently signed-in sessions remain valid until logout, expiry or account deletion.

Logout commits deletion of the validated current Session before invoking Better Auth to expire its cookie. A deletion failure returns safe `503 logout_unavailable` without clearing the retry cookie or claiming success. A successful logout rejects any copied old cookie; other independently signed-in sessions remain valid. Missing, already-revoked and expired sessions are handled idempotently. Logout and account-deletion clearing use the same secure-cookie policy as issuance.

Fastify resolves identity into a request-keyed map. Its route handler runs inside Node `AsyncLocalStorage`; `currentUserId(ctx)` supplies the validated owner to every personal repository call. Concurrent requests cannot overwrite each other's identity. `currentUser(ctx)` may return null for public contextual queries; personal access never supplies a default real-mode ID. Demo identity exists only at the explicit demo boundary, dataset, seed and demo tests. Session creation also rejects demo users.

Every beta mutation requires an exact Origin match with `AUTH_BASE_URL`; absent/foreign origins and cross-site Fetch Metadata are rejected with 403, including login and logout. This deliberately requires non-browser API clients to supply the same Origin. SameSite and Better Auth's own checks add protection; CORS alone is not used as CSRF protection. Personal responses are `private, no-store`. Request logs omit query strings, cookies and authorization; error logs retain a safe class/code rather than raw driver/auth errors that may include credentials. Better Auth logging is disabled.

## Public and personal endpoints

- Public: health, catalogue/search/nearby/event detail, public occurrence history and analytics. Catalogue/detail responses optionally include the validated viewer's visits/favourites/travel; anonymous viewers receive no personal state.
- Personal: all `/api/profile/*`, `/api/account/export`, `DELETE /api/account`, and any tool request with `basis=current_form`. Missing, expired, revoked, unverified or demo sessions produce 401 in beta. A performance ID owned by someone else produces 404 for read/edit/delete.
- Contextual tools and Saturday endpoints remain available without identity using public evidence and an explicit origin where needed. With a session they use only that account's form, PBs, home, visits and favourites. Missing evidence remains explicitly unavailable. A brand-new user has no implicit origin; B1 adds no location onboarding.
- `GET /api/account/session` returns mode, safe account ID/email and expiry, or null user. The beta web app gates its UI on a verified session; demo enters directly.

PBs, Recent Best, visits and challenges stay derived from `UserPerformance`; favourite state stays in existing `UserEvent`. No duplicate personal-history, PB, visit or challenge tables are introduced. The existing Save-event UI remains its pre-B1 placeholder; B1 isolates, exports and deletes stored favourites but does not add a favourites editing feature.

## Runner Form consistency

A performance insert/edit/delete, `User.performanceRevision` increment and deletion of **all** that user's snapshots (including old versions/dates and detailed personal JSON) occur in one transaction under a user-row lock. Other users' snapshots remain untouched. The memory demo store follows the same invalidation contract.

Recalculation reads the revision before reading canonical performances. Saving takes the same row lock and accepts the result only if the revision still matches; competing edits cause bounded retries. A mutation stays successful when recomputation fails because canonical storage and invalidation already committed. Later reads calculate again or return a safe 503; they cannot present an invalidated snapshot as fresh. Analytics refresh still uses its existing factors → scores → Runner Form dependency sequence, with unchanged formulas.

## Client lifecycle and privacy

The mobile flow has email/send-code/verify-code and signed-in state. Profile shows the account email and sign-out/export/delete controls. There is no expanded onboarding or external results connection.

Contextual/personal query keys begin with `['personal', User.id, …]`, including event cards/detail, form-based tools, recommendations, performances and challenges. Pure public history/analytics keep shared keys. On logout, account change, expiry, 401 or session revalidation the account UI is hidden, personal queries are removed/cancelled, mutation cache is removed, and account components remount with the next identity. `keepPreviousData` therefore cannot carry another account's values. One monotonic `AuthEpoch` owns auth reads and personal actions. Every result checks its captured generation; advancing it aborts reads and hides/clears personal state immediately. Cookie-changing login/logout/delete operations are serialized rather than aborted midway, because a response can still set cookies. Web Locks serialize writes and session reads across supported browser tabs. BroadcastChannel announces transition start and completion; other tabs invalidate old reads and wait for completion. Focus revalidates and, with Web Locks, safely recovers a barrier left by a crashed tab after the write lock is released. Cookie-changing operations fail explicitly before issuing a request if Web Locks is unavailable; there is no unsafe cross-tab write fallback. Beta requires a modern secure-context browser with Web Locks and BroadcastChannel. Unmount/remount invalidates old tickets. Export and performance callbacks discard late results; export is also cancelled on component unmount. Public API data is not persisted by the service worker. No authentication credential is stored in browser localStorage.

A new account has zero performances, visited events and favourites; no PB/Recent Best; unavailable Current Form; Alphabet 0/25. Public catalogue events remain visible when present. Existing Saturday logic explains unavailable personal evidence and can rank exploration intents with an explicit origin. B2A excludes DEMO and unprovenanced legacy catalogue rows entirely in beta, including analytical inputs. Demo mode still supplies labelled fictional data. See [catalogue provenance](B2A-catalogue-provenance.md).

## Deletion and export

`DELETE /api/account` requires `{confirmation:"DELETE MY ACCOUNT"}` and the UI requires the user to type that phrase. A transaction removes pending email verification/budget records and deletes the User. Existing cascading FKs delete every owned performance, UserEvent, historical RunnerFormSnapshot, Account and Session. Every other session subsequently fails. The auth cookie is expired. Derived visits/challenges/PBs disappear with canonical data; unrelated users and public catalogue/results remain.

`GET /api/account/export` returns JSON with selected account/profile settings, owned performances, favourite event IDs, performance/form summaries and snapshots including calculation version, revision and as-of date. It excludes auth/session credentials, other users and bulk public results. Recorded performances/profile/favourites and existing snapshots are read independently of Current Form recomputation. If that computation fails, export still returns canonical facts with `summaries.currentForm=null` and machine-readable `derivedStatus.currentForm={status:"error", code:"calculation_unavailable", asOfDate:...}`. No private error details or invented values are exported. Profile offers a JSON download, guarded by the current auth generation. Export/deletion cover the live application database; infrastructure backups follow the deployment's retention policy.

## Verification

Use the supplied `TEST_DATABASE_URL` and one Vitest worker per AGENTS.md. Tests require the established demo fixture and B1/B2A migrations; auth tests create and clean isolated imported synthetic catalogue fixtures, while demo tests remain in explicit demo mode; production/beta bootstrap must still never seed demo data.

```bash
npm run db:up
# Wait for healthy PostgreSQL.
DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy -w @runsaturday/api
DATABASE_URL="$TEST_DATABASE_URL" APP_MODE=demo ALLOW_DESTRUCTIVE_DEMO_SEED=true npm run db:seed -w @runsaturday/api
npm run typecheck
npm test -w @runsaturday/shared -- --maxWorkers=1
npm test -w @runsaturday/api -- --maxWorkers=1
npm test -w @runsaturday/web -- --maxWorkers=1
npm run build
NODE_OPTIONS=--dns-result-order=ipv4first npm run test:e2e
```

The root browser command runs the existing demo suite and the separate three-width auth suite. `test:e2e:auth` runs only the latter. Auth traces are disabled to avoid recording OTP inputs/cookies; the test-only inbox is not committed. Each browser viewport resets only its loopback IP rate-limit test fixture, leaving application limits enabled.

Database/API tests cover normalized/valid/invalid/expired/replayed/concurrently consumed codes, attempts/resends, safe provider failure, Secure HTTPS beta cookies with omitted NODE_ENV, the explicit local HTTP exception, fixation, session expiry/revocation/logout including deletion failure and retry, origins, empty accounts, overlapping cross-user resources and all contextual routes, persistence with a newly built app/database connection, form invalidation/failure/revision rejection, owned export and full deletion including historical JSON. Email-budget tests trigger actual Better Auth cleanup, prove both limits survive beyond 60 seconds through 599,999 ms, reset at 600 seconds, and verify concurrent increments and persistence across independent clients. Cache tests cover identity keys, removal, shared public data and in-flight responses. Browser tests cover empty Profile, persisted performance, logout/re-login, account switching with a DOM-mutation no-flash check and explicit deletion at 360/390/430 px.

B1.1 adds deliberately delayed React/transport tests for queued logout/login, stale session reads, expiry, BroadcastChannel barriers, StrictMode/unmount and export after account switching; late aborted 401 responses cannot expire the next account. Focus revalidation preserves an already signed-out email/OTP form when returning from an inbox, while invalidating older request generations; signed-in personal UI is hidden during revalidation. PostgreSQL tests verify fixed expiry, resilient export and refusal to seed authenticated or imported catalogue data. Proxy tests exercise the Fastify-resolved address, untrusted forwarding hops and trust-all aliases.

### B1.1 independent-review corrections

Every login, logout and account-deletion intention captures its session owner and fixed expiry. After acquiring the shared Web Lock it checks the generation, reads the authoritative session, checks the generation again and compares the intended session before sending. There is no asynchronous gap between the final check and the cookie-mutating request. Obsolete intentions abort locally without sending; writes already sent remain serialized to their completion because their response may change cookies. Session intent is updated synchronously so React batching and revalidation do not retarget queued operations.

`/api/account/session` now returns the identity and expiry from the single HTTP-boundary session validation, including the verified/non-demo owner check. It does not combine a first identity with a second expired/revoked session result. Fixed seven-day expiry and disabled renewal remain unchanged.

Regression coverage includes FIFO queued-lock React tests (delete/logout/login), an owner mismatch without timely BroadcastChannel delivery, both multi-tab transition orders, late 401/export/refresh results, and Playwright tests using actual browser Web Locks while another tab replaces A with B. No stale delete/logout request may be sent, and both accounts must remain intact.
