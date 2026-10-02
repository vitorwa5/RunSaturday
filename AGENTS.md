# RunSaturday Codex instructions

Repository: `vitorwa5/RunSaturday`.

- Use the repository's existing npm scripts and development commands whenever possible. Do not change application source just to work around a Codex Cloud environment issue.
- Start PostgreSQL before database or database-backed API work with `npm run db:up`. Wait until the PostgreSQL service is healthy (`docker compose ps`) before database/API validation.
- `DATABASE_URL` and `TEST_DATABASE_URL` are supplied by the Cloud Environment. Use `TEST_DATABASE_URL` with the established RunSaturday test database for database tests; do not substitute another database.
- Run Vitest with one worker because parallel execution has caused intermittent API-test timeouts. For API tests, use `npm test -w @runsaturday/api -- --maxWorkers=1`; apply `--maxWorkers=1` to other relevant Vitest commands too.
- Browser tests must use the Playwright-pinned Chromium from the Cloud Environment's `PLAYWRIGHT_BROWSERS_PATH`, never system Chromium 151. Run browser tests with IPv4-first DNS on the command itself: `NODE_OPTIONS=--dns-result-order=ipv4first npm run test:e2e`.
- After code changes, run the relevant tests. For broad architectural changes, inspect the relevant existing implementation and tests before editing.
