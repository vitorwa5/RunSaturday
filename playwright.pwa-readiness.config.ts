import { defineConfig } from '@playwright/test';
import cacheGate from './playwright.b4-cache.config';

// Coordinator builds artifacts and starts PostgreSQL before this standalone gate.
// Reuse the already reviewed loopback host/proxy; each case selects its NEW build.
// OLD must remain a distinct real build, as required by that host's startup guard.
// B4_API_ROOT and B4_NEW_WEB_DIST must explicitly identify this release candidate.
if (!process.env.B4_API_ROOT || !process.env.B4_NEW_WEB_DIST) {
  throw new Error('PWA readiness requires explicit B4_API_ROOT and B4_NEW_WEB_DIST');
}
if (process.env.PW_CHROMIUM_PATH) throw new Error('PWA readiness requires Playwright-pinned Chromium');

export default defineConfig({
  ...cacheGate,
  testDir: './e2e-pwa-readiness',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  projects: [360, 390, 430].map(width => ({
    name: `built-pwa-${width}`,
    use: { viewport: { width, height: 844 }, isMobile: true, hasTouch: true },
  })),
});
