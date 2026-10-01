import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;

// Use a preinstalled Chromium when provided (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium).
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 760 }, launchOptions } },
    { name: 'mobile-430', use: { ...devices['Pixel 5'], viewport: { width: 430, height: 900 }, launchOptions } },
  ],
  webServer: [
    {
      // DEMO in-memory data: e2e tests need no database.
      command: `npm run dev:demo -w @runsaturday/api`,
      env: { PORT: String(API_PORT), LOG_LEVEL: 'warn', DATA_SOURCE: 'demo' },
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -w @runsaturday/web -- --port ${WEB_PORT} --strictPort`,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
