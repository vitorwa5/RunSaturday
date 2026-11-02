import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4178';
async function codeFor(email: string) {
  const inbox = await readFile('/tmp/runsaturday-b4-cache-inbox.jsonl', 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''; throw error;
  });
  return inbox.split('\n').filter(line => line.trim()).map(line => JSON.parse(line)).filter(row => row.email === email).at(-1)?.code ?? '';
}
async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  let code = '';
  await expect.poll(async () => { code = await codeFor(email); return code.length; }).toBe(6);
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
}
const upload = (page: Page, event: string) => page.getByLabel('Choose personal history CSV').setInputFiles({
  name: 'synthetic-cache-upgrade.csv', mimeType: 'text/csv',
  buffer: Buffer.from(`date,event_name,time\n2026-09-05,${event},24:31`),
});
async function cachedAssets(page: Page) {
  return page.evaluate(async () => {
    const assets: { path: string; digest: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) throw new Error('Cache response disappeared');
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())))
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
        assets.push({ path: new URL(request.url).pathname, digest });
      }
    }
    return assets;
  });
}
type LockWindow = Window & { b4CacheRelease?: () => void; b4CacheHeld?: boolean };

test('cached OLD B4 safely fails against NEW API, then real SW activation enables bound private import', async ({ page, context, browser }) => {
  // Import the SAME generated client as the API; this gate never generates Prisma or builds artifacts.
  const { createPrismaClient } = await import(`${process.env.B4_API_ROOT ?? '/workspace/RunSaturday-b4-gate'}/apps/api/src/db/prisma.ts`);
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  const run = randomUUID();
  const a = `b4-cache-${run}-a@example.test`; const b = `b4-cache-${run}-b@example.test`;
  const marker = `Synthetic private upgrade ${run}`;
  const otherContext = await browser.newContext({ baseURL: origin, serviceWorkers: 'allow' });
  const urls: string[] = [];
  context.on('request', request => urls.push(request.url()));
  try {
    const stateResponse = await context.request.get('/__b4_fixture__/state');
    expect(stateResponse.ok()).toBe(true);
    const { active, builds } = await stateResponse.json();
    expect(active).toBe('old'); expect(builds.old.digest).not.toBe(builds.new.digest);
    expect(builds.old.swDigest).not.toBe(builds.new.swDigest);
    await page.goto('/profile/import-history');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    // A controlled navigation proves the OLD generated worker really supplies the shell.
    const navigation = await page.reload();
    expect(navigation?.fromServiceWorker()).toBe(true);
    await expect.poll(async () => (await cachedAssets(page)).some(asset => asset.path === builds.old.asset && asset.digest === builds.old.digest)).toBe(true);
    expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(builds.old.asset);
    await signIn(page, a);
    const sessionResponse = await context.request.get('/api/account/session');
    expect(sessionResponse.headers()['cache-control']).toContain('no-store');
    const session = await sessionResponse.json();
    expect(session.sessionBinding).toMatch(/^[a-f0-9]{64}$/);
    // Give the unbound old withdrawal request something real to protect.
    await db.userPerformance.create({ data: { userId: session.user.id, date: new Date('2026-09-01'),
      externalEventName: `Synthetic preserved ${run}`, finishTimeSeconds: 1500, source: 'CSV',
      externalResultId: `cache-fixture-${run}`, duplicateKey: `external:cache-fixture-${run}|2026-09-01|5000` } });
    const before = await db.userPerformance.findMany({ where: { userId: session.user.id }, orderBy: { id: 'asc' } });
    const revisionBefore = (await db.user.findUniqueOrThrow({ where: { id: session.user.id } })).performanceRevision;
    const snapshotsBefore = await db.runnerFormSnapshot.findMany({ where: { userId: session.user.id }, orderBy: { id: 'asc' } });
    const oldPreviewPromise = page.waitForResponse(response => response.url().endsWith('/api/profile/history-import/preview'));
    await upload(page, marker);
    const oldPreview = await oldPreviewPromise;
    const oldBody = oldPreview.request().postDataJSON();
    expect(oldBody).not.toHaveProperty('sessionBinding');
    expect(oldPreview.status()).toBe(409);
    expect(await oldPreview.json()).toMatchObject({ error: { code: 'session_changed' } });
    expect(oldPreview.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('alert')).toContainText('Your account session changed');
    await expect(page.getByRole('heading', { name: 'Preview: 1 rows' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm import', exact: true })).toHaveCount(0);
    // Old wire-format mutation attempts must also fail, never reinterpret the current cookie.
    const rejected = await page.evaluate(async rows => {
      const results = [];
      for (const operation of ['commit', 'delete']) {
        const response = await fetch('/api/profile/history-import' + (operation === 'commit' ? '/commit' : ''), {
          method: operation === 'commit' ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operation === 'commit' ? { rows, confirmation: 'IMPORT MY OWN HISTORY' } : { confirmation: 'REMOVE MY CSV HISTORY' }),
        });
        results.push({ status: response.status, body: await response.json() });
      }
      return results;
    }, oldBody.rows);
    expect(rejected).toEqual([0, 1].map(() => ({ status: 409, body: { error: { code: 'session_changed', message: 'Your account session changed. Reopen the import and choose your file again.' } } })));
    expect(await db.userPerformance.findMany({ where: { userId: session.user.id }, orderBy: { id: 'asc' } })).toEqual(before);
    expect((await db.user.findUniqueOrThrow({ where: { id: session.user.id } })).performanceRevision).toBe(revisionBefore);
    expect(await db.runnerFormSnapshot.findMany({ where: { userId: session.user.id }, orderBy: { id: 'asc' } })).toEqual(snapshotsBefore);

    expect((await context.request.post('/__b4_fixture__/switch/new')).ok()).toBe(true);
    // Listen before update: autoUpdate workers skip waiting and claim existing clients.
    const activated = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error('OLD service worker is not active');
      const previous = navigator.serviceWorker.controller;
      const changed = new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NEW worker did not claim the OLD client')), 20_000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timer); resolve(navigator.serviceWorker.controller !== previous);
        }, { once: true });
      });
      await registration.update();
      return changed;
    });
    expect(activated).toBe(true);
    const upgradedNavigation = await page.reload();
    expect(upgradedNavigation?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
    expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(builds.new.asset);
    const assets = await cachedAssets(page);
    expect(assets).toContainEqual({ path: builds.new.asset, digest: builds.new.digest });
    expect(assets.some(asset => asset.path === builds.old.asset)).toBe(false);

    const sequence: string[] = []; const bodies: Record<string, unknown>[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/account/session' || path.startsWith('/api/profile/history-import')) sequence.push(path);
      if (path.startsWith('/api/profile/history-import')) bodies.push(request.postDataJSON());
    });
    // Hold the real shared lock; upgraded history must check the session AFTER release.
    await page.evaluate(() => {
      void navigator.locks.request('5k-compass-auth', async () => {
        (window as LockWindow).b4CacheHeld = true;
        await new Promise<void>(resolve => { (window as LockWindow).b4CacheRelease = resolve; });
      });
    });
    await expect.poll(() => page.evaluate(() => (window as LockWindow).b4CacheHeld)).toBe(true);
    sequence.length = 0;
    await upload(page, marker);
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.some(lock => lock.name === '5k-compass-auth') ?? false)).toBe(true);
    expect(sequence).toEqual([]);
    await page.evaluate(() => (window as LockWindow).b4CacheRelease?.());
    await expect(page.getByRole('heading', { name: 'Preview: 1 rows' })).toBeVisible();
    expect(sequence).toEqual(['/api/account/session', '/api/profile/history-import/preview']);
    await page.getByRole('checkbox', { name: /I confirm this file/ }).check();
    await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
    expect(sequence).toEqual(['/api/account/session', '/api/profile/history-import/preview', '/api/account/session', '/api/profile/history-import/commit']);
    expect(bodies).toHaveLength(2);
    expect(bodies.every(body => body.sessionBinding === session.sessionBinding && !('userId' in body))).toBe(true);
    expect(await db.userPerformance.count({ where: { userId: session.user.id, externalEventName: marker, source: 'CSV', verified: false, eventId: null } })).toBe(1);
    const other = await otherContext.newPage(); await other.goto('/profile/import-history'); await signIn(other, b);
    const privateList = await otherContext.request.get('/api/profile/performances');
    expect(privateList.ok()).toBe(true);
    expect(privateList.headers()['cache-control']).toContain('no-store');
    expect((await privateList.json()).performances).toEqual([]);
    expect(await db.userPerformance.count({ where: { user: { email: b } } })).toBe(0);
    const cookies = await context.cookies();
    const secrets = [a, b, marker, session.sessionBinding, ...cookies.map(cookie => cookie.value)].filter(Boolean);
    for (const url of urls) {
      if (new URL(url).pathname.startsWith('/api/')) expect(new URL(url).search).toBe('');
      expect(secrets.some(secret => url.includes(secret) || url.includes(encodeURIComponent(secret)))).toBe(false);
    }
    const sessionCookies = cookies.filter(cookie => cookie.name.includes('session_token'));
    expect(sessionCookies.length).toBeGreaterThan(0);
    expect(sessionCookies.every(cookie => cookie.httpOnly)).toBe(true);
    const cacheLeaks = await page.evaluate(async values => {
      const leaks: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.startsWith('/api/')) leaks.push('API cached');
          const body = await (await cache.match(request))!.text();
          if (values.some(value => body.includes(value) || request.url.includes(value))) leaks.push('Private value cached');
        }
      }
      return leaks;
    }, secrets);
    expect(cacheLeaks).toEqual([]);
  } finally {
    await page.evaluate(() => (window as LockWindow).b4CacheRelease?.()).catch(() => undefined);
    await otherContext.close(); await context.close();
    await db.user.deleteMany({ where: { email: { in: [a, b] } } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { in: [a, b] } } });
    await db.rateLimit.deleteMany({ where: { key: { in: [a, b].flatMap(email => [`email:${email}:send`, `email:${email}:verify`]) } } });
    await db.$disconnect();
  }
});
