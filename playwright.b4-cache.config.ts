import { defineConfig } from '@playwright/test';

// Standalone gate: never collected by the development-server e2e configs.
// Coordinator builds OLD 1fd215c and NEW aa0a36c production web artifacts once first.
// B4_OLD_WEB_DIST / B4_NEW_WEB_DIST override the fixture's default worktree dist paths;
// B4_API_ROOT must contain the NEW API and its already-generated Prisma client.
// Run in the reserved DB/browser lane with the supplied TEST_DATABASE_URL:
// NODE_OPTIONS=--dns-result-order=ipv4first npx playwright test --config playwright.b4-cache.config.ts
// Chromium uses Playwright's pinned browser from PLAYWRIGHT_BROWSERS_PATH.
// The artifact host uses no-store, so this checks controlled-host SW upgrade correctness.
if (!process.env.TEST_DATABASE_URL) throw new Error('B4 cache gate requires the supplied TEST_DATABASE_URL');
const apiRoot = process.env.B4_API_ROOT ?? '/workspace/RunSaturday-b4-gate';
export default defineConfig({
  testDir: './e2e-b4-cache', testMatch: 'upgrade.spec.ts', fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 15_000 }, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow', trace: 'off', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs apps/api/src/server.ts', cwd: apiRoot,
      env: { PORT: '3104', HOST: '127.0.0.1', APP_MODE: 'beta', NODE_ENV: 'test', DATA_SOURCE: 'database',
        DATABASE_URL: process.env.TEST_DATABASE_URL, LOG_LEVEL: 'warn', AUTH_BASE_URL: 'http://127.0.0.1:4178',
        AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'b4-cache-synthetic-test-only-secret-32-characters',
        EMAIL_TRANSPORT: 'test', OTP_TEST_INBOX_PATH: '/tmp/runsaturday-b4-cache-inbox.jsonl' },
      url: 'http://127.0.0.1:3104/api/health', reuseExistingServer: false },
    { command: 'node scripts/b4-cache-server.mjs', env: { NODE_ENV: 'test', B4_CACHE_FIXTURE: 'synthetic-only' },
      url: 'http://127.0.0.1:4178/__b4_fixture__/state', reuseExistingServer: false },
  ],
});
