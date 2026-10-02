# B1: authenticated accounts and personal data

B1 introduces passwordless email accounts without changing any running, challenge or Saturday mathematics. Real event ingestion and geography/travel changes belong to B2 and later phases.

## Modes and startup

`APP_MODE` is mandatory and independent of `DATA_SOURCE`:

- `APP_MODE=demo`: deliberately shared fictional `demo-user` and deterministic history; either the memory store (`DATA_SOURCE=demo`) or the seeded development database. Never use this mode for real accounts. `npm run dev:demo` supplies both flags.
- `APP_MODE=beta`: PostgreSQL only, verified email and server sessions. Missing auth/delivery configuration or B1 database tables stops startup. `NODE_ENV=production` requires beta mode and an HTTPS public origin. There is no demo fallback, including when a database or session lookup fails.

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

Bootstrap with `npm run db:deploy -w @runsaturday/api`, then start the built API and serve the web build. Do **not** run `db:seed` or `db:reset` as beta bootstrap. The demo seed requires explicit `APP_MODE=demo` and rejects `NODE_ENV=production` before creating a database client. The migration is additive: legacy demo rows keep null email, `emailVerified=false`, and their ownership. Demo rows never become real identities.

The test transport requires `NODE_ENV=test`; real beta/development and production require Resend configuration. Integration tests inject an in-memory delivery implementation. Browser tests use `OTP_TEST_INBOX_PATH`, an opt-in file inbox created with mode 0600 under `/tmp`. There is no HTTP inbox endpoint and codes are never logged. This transport is for tests only; remove its file after testing. No external emails are sent by the test suite.

## Identity and passwordless flow

Better Auth 1.7.7 supplies the maintained email-OTP plugin, secure code generation/hash verification, atomic single-use consumption, Prisma adapter and opaque session machinery. The existing `User.id` remains the immutable personal-data owner; verified normalized email is the passwordless identity. The adapter maps Better Auth's `name` field to existing `User.displayName`.

1. `POST /api/auth/email-otp/send-verification-otp` accepts only `{email}`. Trim/lowercase/email validation occurs before auth; the server supplies the sign-in purpose.
2. A six-digit code expires after five minutes, is stored hashed, and is replaced on resend. After five incorrect attempts the code is unusable. Atomic consumption prevents replay, including concurrent verification.
3. `POST /api/auth/sign-in/email-otp` accepts only `{email, otp}`. Verification creates an empty user or resolves the existing internal ID, marks email verified and creates a fresh session. No client-selected owner, display name, demo flag or initial history is accepted.
4. The HTTP adapter forwards the cookie and returns `{success:true}`; Better Auth's raw token/user response is not exposed. Other Better Auth endpoints, including code lookup, password sign-in, identity changes and arbitrary account operations, are not mounted.

Email delivery is a small `EmailDelivery` interface. The Resend implementation uses its fixed HTTPS API with a 15-second timeout and no provider-detail logging. Better Auth catches email-task errors internally, so a request-local delivery result lets the HTTP boundary return a safe 503 and remove the undelivered verification record. A configured provider's actual domain/key/delivery still needs deployment validation.

Login protections remain enabled in tests: database-backed per-IP limits (30 requests per 60 seconds globally, 10 per OTP route), plus atomic per-normalized-email limits shared across IPs (five sends and fifteen verifications per ten minutes). Socket IP is authoritative; forwarded/client-supplied IP headers are replaced. Behind a proxy this conservatively groups its clients; configure deployment capacity before a larger beta instead of trusting arbitrary forwarded headers.

## Sessions and request ownership

Session tokens are opaque, signed by the library and stored in PostgreSQL. The browser holds only an HttpOnly, SameSite=Lax, Path=/ cookie with a seven-day lifetime; production adds Secure and the `__Secure-` prefix. There is no localStorage bearer token and cookie/session caching is disabled. Every request checks the server session and a verified, non-demo internal User. Better Auth can renew the server expiry after one day of activity; the cookie retains its own maximum lifetime and users can sign in again. A successful sign-in rotates to a new token and revokes the session cookie it replaced; independently signed-in sessions remain valid until logout, expiry or account deletion.

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

Contextual/personal query keys begin with `['personal', User.id, …]`, including event cards/detail, form-based tools, recommendations, performances and challenges. Pure public history/analytics keep shared keys. On logout, account change, expiry, 401 or session revalidation the account UI is hidden, personal queries are removed/cancelled, mutation cache is removed, and account components remount with the next identity. `keepPreviousData` therefore cannot carry another account's values. Login/logout/expiry changes are broadcast across tabs; focus revalidates the server session. Public API data is not persisted by the service worker. No authentication credential is stored in browser localStorage.

A new account has zero performances, visited events and favourites; no PB/Recent Best; unavailable Current Form; Alphabet 0/25. Public catalogue events remain visible when present. Existing Saturday logic explains unavailable personal evidence and can rank exploration intents with an explicit origin. Shared fictional catalogue content is still labelled DEMO; replacing it is outside B1.

## Deletion and export

`DELETE /api/account` requires `{confirmation:"DELETE MY ACCOUNT"}` and the UI requires the user to type that phrase. A transaction removes pending email verification/budget records and deletes the User. Existing cascading FKs delete every owned performance, UserEvent, historical RunnerFormSnapshot, Account and Session. Every other session subsequently fails. The auth cookie is expired. Derived visits/challenges/PBs disappear with canonical data; unrelated users and public catalogue/results remain.

`GET /api/account/export` returns JSON with selected account/profile settings, owned performances, favourite event IDs, performance/form summaries and snapshots including calculation version, revision and as-of date. It excludes auth/session credentials, other users and bulk public results. Profile offers a JSON download. Export/deletion cover the live application database; infrastructure backups follow the deployment's retention policy.

## Verification

Use the supplied `TEST_DATABASE_URL` and one Vitest worker per AGENTS.md. Tests require the established demo fixture and B1 migration; production/beta bootstrap must still never seed demo data.

```bash
npm run db:up
# Wait for healthy PostgreSQL.
DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy -w @runsaturday/api
DATABASE_URL="$TEST_DATABASE_URL" APP_MODE=demo npm run db:seed -w @runsaturday/api
npm run typecheck
npm test -w @runsaturday/shared -- --maxWorkers=1
npm test -w @runsaturday/api -- --maxWorkers=1
npm test -w @runsaturday/web -- --maxWorkers=1
npm run build
NODE_OPTIONS=--dns-result-order=ipv4first npm run test:e2e
```

The root browser command runs the existing demo suite and the separate three-width auth suite. `test:e2e:auth` runs only the latter. Auth traces are disabled to avoid recording OTP inputs/cookies; the test-only inbox is not committed. Each browser viewport resets only its loopback IP rate-limit test fixture, leaving application limits enabled.

Database/API tests cover normalized/valid/invalid/expired/replayed/concurrently consumed codes, attempts/resends, safe provider failure, Secure production cookies, fixation, session expiry/revocation/logout, origins, empty accounts, overlapping cross-user resources and all contextual routes, persistence with a newly built app/database connection, form invalidation/failure/revision rejection, owned export and full deletion including historical JSON. Cache tests cover identity keys, removal, shared public data and in-flight responses. Browser tests cover empty Profile, persisted performance, logout/re-login, account switching with a DOM-mutation no-flash check and explicit deletion at 360/390/430 px.
