import { defineConfig, devices } from '@playwright/test';
const API_PORT = 3102;
const WEB_PORT = 5175;
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
if (!process.env.TEST_DATABASE_URL) throw new Error('B1 browser tests require the supplied TEST_DATABASE_URL');
export default defineConfig({
  testDir: './e2e', testMatch: 'auth.spec.ts', fullyParallel: false, workers: 1,
  timeout: 60_000, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'off', screenshot: 'only-on-failure', launchOptions },
  projects: [360, 390, 430].map((width) => ({ name: `auth-${width}`, use: { ...devices['Pixel 5'], viewport: { width, height: 844 }, launchOptions } })),
  webServer: [
    { command: 'npm run dev -w @runsaturday/api', env: { PORT: String(API_PORT), APP_MODE: 'beta', NODE_ENV: 'test', DATA_SOURCE: 'database', DATABASE_URL: process.env.TEST_DATABASE_URL, LOG_LEVEL: 'warn', AUTH_BASE_URL: `http://127.0.0.1:${WEB_PORT}`, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'b1-browser-test-only-secret-32-characters-long', EMAIL_TRANSPORT: 'test', OTP_TEST_INBOX_PATH: '/tmp/runsaturday-b1-browser-inbox.jsonl' }, url: `http://127.0.0.1:${API_PORT}/api/health`, reuseExistingServer: false },
    { command: `npm run dev -w @runsaturday/web -- --port ${WEB_PORT} --strictPort`, env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` }, url: `http://127.0.0.1:${WEB_PORT}`, reuseExistingServer: false },
  ],
});
