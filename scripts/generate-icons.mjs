// Rasterises apps/web/public/favicon.svg into the PNG icons the PWA manifest needs.
// Usage: node scripts/generate-icons.mjs   (requires Playwright's Chromium)
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const svg = readFileSync(new URL('favicon.svg', publicDir), 'utf8');
const targets = [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [name, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:#c2410c">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(name, publicDir).pathname, omitBackground: false });
  console.log(`wrote ${name}`);
}
await browser.close();
