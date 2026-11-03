import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4178';
const apiRoot = process.env.B4_API_ROOT!;
const sessionPath = '/api/account/session';

async function codeFor(email: string) {
  const inbox = await readFile('/tmp/runsaturday-b4-cache-inbox.jsonl', 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''; throw error;
  });
  return inbox.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.email === email).at(-1)?.code ?? '';
}

async function fixtureLogin(context: BrowserContext, email: string, binding = 'signed-out') {
  const sent = await context.request.post('/api/auth/email-otp/send-verification-otp', { headers: { origin }, data: { email } });
  expect(sent.ok()).toBe(true);
  let otp = ''; await expect.poll(async () => { otp = await codeFor(email); return otp.length; }).toBe(6);
  const signedIn = await context.request.post('/api/auth/sign-in/email-otp', {
    headers: { origin, 'x-compass-session-binding': binding }, data: { email, otp },
  });
  expect(signedIn.ok()).toBe(true);
  const current = await context.request.get(sessionPath);
  expect(current.ok()).toBe(true);
  return current.json();
}

async function selectBuiltShell(context: BrowserContext, page: Page, path: string) {
  expect((await context.request.post('/__b4_fixture__/switch/new')).ok()).toBe(true);
  const state = await (await context.request.get('/__b4_fixture__/state')).json();
  await page.goto(path);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const navigation = await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(state.builds.new.asset);
  return state.builds.new;
}

async function expectNoPrivateCache(page: Page, secrets: string[]) {
  const result = await page.evaluate(async values => {
    const entries: string[] = []; const leaks: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) throw new Error('Cached response disappeared');
        entries.push(new URL(request.url).pathname);
        if (new URL(request.url).pathname.startsWith('/api/')) leaks.push('API response');
        const body = await response.text();
        if (values.some(value => request.url.includes(value) || body.includes(value))) leaks.push('Private value');
      }
    }
    return { entries, leaks };
  }, secrets.filter(Boolean));
  expect(result.entries).toContain('/index.html');
  expect(result.entries.some(path => path.startsWith('/assets/'))).toBe(true);
  expect(result.leaks).toEqual([]);
}

async function cleanup(run: string) {
  const { createPrismaClient } = await import(`${apiRoot}/apps/api/src/db/prisma.ts`);
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  try {
    // Only this case's disposable synthetic records; never reset shared fixtures.
    await db.user.deleteMany({ where: { email: { contains: run } } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: run } } });
  } finally { await db.$disconnect(); }
}

test('built install metadata/icons and real offline navigation expose only a safe shell', async ({ page, context }) => {
  await selectBuiltShell(context, page, '/profile');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await context.request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: '5K Compass', short_name: '5K Compass', display: 'standalone', start_url: '/', scope: '/' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
  ]));
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async src => {
      const response = await fetch(src); if (!response.ok) throw new Error('Missing install icon');
      const bitmap = await createImageBitmap(await response.blob());
      const result = `${bitmap.width}x${bitmap.height}`; bitmap.close(); return result;
    }, icon.src);
    expect(dimensions).toBe(icon.sizes);
  }
  const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleHref).toBeTruthy(); expect((await context.request.get(appleHref!)).ok()).toBe(true);
  try {
    await context.setOffline(true);
    const navigation = await page.goto('/explore');
    expect(navigation?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('heading', { name: 'You’re offline', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('status')).toContainText('Your private history is not available offline');
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expectNoPrivateCache(page, []);
  } finally { await context.setOffline(false); }
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('real built SW hides private CSV offline and reconnects to the authoritative replacement account', async ({ page, context }) => {
  const run = randomUUID(); const a = `pwa-${run}-a@example.test`; const b = `pwa-${run}-b@example.test`;
  const marker = `Private offline CSV ${run}`;
  const observedUrls: string[] = [];
  context.on('request', request => observedUrls.push(request.url()));
  try {
    const original = await fixtureLogin(context, a);
    await selectBuiltShell(context, page, '/profile/import-history');
    await expect(page.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
    await page.getByLabel('Choose personal history CSV').setInputFiles({ name: 'private-synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(`date,event_name,time\n2026-09-05,${marker},24:31`) });
    await expect(page.getByRole('heading', { name: 'Preview: 1 rows', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm this file/ }).check();
    await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import complete', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View recorded history', exact: true }).click();
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
    const before = await (await context.request.get('/api/profile/performances', { headers: { 'x-compass-session-binding': original.sessionBinding } })).json();
    expect(before.performances).toEqual(expect.arrayContaining([expect.objectContaining({ externalEventName: marker, source: 'csv', verified: false })]));
    // Profile exposes both account identity and recent history before and after reconnect.
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page.getByText(`Signed in as ${a}`, { exact: true })).toBeVisible();
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: 'You’re offline', exact: true })).toBeVisible();
    await expect(page.getByText(marker, { exact: false })).toHaveCount(0);
    await expect(page.getByText(`Signed in as ${a}`, { exact: true })).toHaveCount(0);
    const offlineNavigation = await page.reload();
    expect(offlineNavigation?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('heading', { name: 'You’re offline', exact: true })).toBeVisible();
    await expectNoPrivateCache(page, [a, marker, original.sessionBinding]);

    // APIRequestContext is a genuine network transport with the same cookie jar.
    // Replace the cookie while the browser is offline; no UI/server success is mocked.
    const replacement = await fixtureLogin(context, b, original.sessionBinding);
    expect(replacement.user.id).not.toBe(original.user.id);
    expect(replacement.sessionBinding).not.toBe(original.sessionBinding);
    await page.evaluate(values => {
      const state = window as Window & { stalePrivateSeen?: boolean; privateObserver?: MutationObserver };
      state.stalePrivateSeen = false;
      state.privateObserver = new MutationObserver(() => {
        if (values.some(value => document.body.textContent?.includes(value))) state.stalePrivateSeen = true;
      });
      state.privateObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, [a, marker]);
    await context.setOffline(false);
    await expect(page.getByText(`Signed in as ${b}`, { exact: true })).toBeVisible();
    await expect(page.getByText('No performances yet', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { stalePrivateSeen?: boolean }).stalePrivateSeen)).toBe(false);
    await expect(page.getByText(marker, { exact: false })).toHaveCount(0);
    await expect(page.getByText('DEMO DATA', { exact: true })).toHaveCount(0);
    const privateList = await context.request.get('/api/profile/performances', { headers: { 'x-compass-session-binding': replacement.sessionBinding } });
    expect(privateList.ok()).toBe(true); expect(privateList.headers()['cache-control']).toContain('no-store');
    expect((await privateList.json()).performances).toEqual([]);
    const cookies = await context.cookies();
    await expectNoPrivateCache(page, [a, b, marker, original.sessionBinding, replacement.sessionBinding, ...cookies.map(cookie => cookie.value)]);
    for (const url of observedUrls) {
      expect([a, b, marker, original.sessionBinding, replacement.sessionBinding].some(secret => url.includes(secret) || url.includes(encodeURIComponent(secret)))).toBe(false);
    }
  } finally {
    await context.setOffline(false); await page.close(); await cleanup(run);
  }
});

test('failed authoritative bootstrap cannot report authenticated success; real retry recovers', async ({ page, context }) => {
  const run = randomUUID(); const email = `pwa-failure-${run}@example.test`;
  try {
    const session = await fixtureLogin(context, email);
    await selectBuiltShell(context, page, '/profile');
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await page.route('**/api/account/session', route => route.abort('failed'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Session check unavailable', exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export my data', exact: true })).toHaveCount(0);
    // The real cookie still exists: an error view must never infer login success
    // merely because refresh() resolved after handling a rejected network request.
    expect((await (await context.request.get(sessionPath)).json()).sessionBinding).toBe(session.sessionBinding);
    await page.unroute('**/api/account/session');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Session check unavailable', exact: true })).toHaveCount(0);
    await expectNoPrivateCache(page, [email, session.sessionBinding]);
  } finally { await page.close(); await cleanup(run); }
});
