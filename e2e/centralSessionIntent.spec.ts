import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';

type Holder = Window & { centralLock?: { entered: boolean; changed: boolean; status?: number; change?: () => void; release?: () => void } };
const bindingHeader = 'x-compass-session-binding';
async function codeFor(email: string) {
  const text = await readFile('/tmp/runsaturday-b1-browser-inbox.jsonl', 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return ''; throw e; });
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.email === email).at(-1)?.code ?? '';
}
async function login(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  let code = ''; await expect.poll(async () => { code = await codeFor(email); return code.length; }).toBe(6);
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
}

for (const replacement of ['another-account', 'same-account'] as const) {
  for (const operation of ['settings', 'add', 'edit', 'delete-performance', 'export', 'delete-account', 'logout', 'contextual-read'] as const) {
    test(`CENTRAL missed notifications: queued ${operation} cannot adopt ${replacement} cookie`, async ({ page, context }) => {
      const run = randomUUID(); const a = `central-browser-${run}-a@example.test`;
      const b = replacement === 'same-account' ? a : `central-browser-${run}-b@example.test`;
      const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
      const holder = await context.newPage();
      const downloads: string[] = []; page.on('download', d => downloads.push(d.suggestedFilename()));
      try {
        await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map(prefix => ({ key: { startsWith: prefix } })) } });
        await page.addInitScript(() => {
          window.BroadcastChannel = class { onmessage = null; postMessage() {} close() {} } as unknown as typeof BroadcastChannel;
          window.addEventListener('focus', event => event.stopImmediatePropagation(), true);
          window.addEventListener('storage', event => event.stopImmediatePropagation(), true);
        });
        await page.goto('/profile'); await login(page, a);
        const original = await (await context.request.get('/api/account/session')).json();
        const seed = await context.request.post('/api/profile/performances', { headers: { origin: 'http://127.0.0.1:5175', [bindingHeader]: original.sessionBinding }, data: { date: '2026-09-20', externalEventName: 'Origin private synthetic run', time: '24:31' } });
        expect(seed.status()).toBe(201); const performanceId = (await seed.json()).id;
        if (operation === 'edit' || operation === 'delete-performance') {
          const catalogue = page.waitForResponse(response => new URL(response.url()).pathname === '/api/events' && response.request().method() === 'GET');
          await page.goto(`/profile/performances/${performanceId}/edit`);
          expect((await catalogue).status()).toBe(200);
          await expect(page.getByRole('form', { name: 'Edit performance' })).toBeVisible();
          if (operation === 'edit') await page.getByLabel('Finish time').fill('20:00');
          else await page.getByRole('button', { name: 'Delete performance', exact: true }).click();
        } else if (operation === 'add') {
          const catalogue = page.waitForResponse(response => new URL(response.url()).pathname === '/api/events' && response.request().method() === 'GET');
          await page.goto('/profile/performances/new');
          expect((await catalogue).status()).toBe(200);
          await page.getByRole('radio', { name: 'Other 5K race', exact: true }).click();
          await page.getByLabel('Race name').fill('Queued stale new run');
          await page.getByLabel('Date', { exact: true }).fill('2026-09-21');
          await page.getByLabel('Finish time').fill('20:00');
        } else {
          await page.goto('/profile');
          await expect(page.getByRole('button', { name: 'Export my data', exact: true })).toBeVisible();
          if (operation === 'settings') await page.getByLabel('Town or postcode district').fill('Stale town');
          if (operation === 'delete-account') {
            await page.getByRole('button', { name: 'Delete account', exact: true }).click();
            await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
          }
        }
        await holder.goto('/profile');
        await expect(holder.getByText(`Signed in as ${a}`, { exact: true })).toBeVisible();
        expect((await context.request.post('/api/auth/email-otp/send-verification-otp', { headers: { origin: 'http://127.0.0.1:5175' }, data: { email: b } })).status()).toBe(200);
        let code = ''; await expect.poll(async () => { code = await codeFor(b); return code.length; }).toBe(6);
        // Finish initial contextual reads before acquiring the holder's lock, so only
        // the action below can account for the subsequent pending-lock assertion.
        await expect.poll(() => page.evaluate(async () => {
          const locks = await navigator.locks.query();
          return [...locks.held, ...locks.pending].filter(lock => lock.name === '5k-compass-auth').length;
        })).toBe(0);
        await holder.evaluate(({ email, otp, binding }) => {
          const state = { entered: false, changed: false } as NonNullable<Holder['centralLock']>;
          (window as Holder).centralLock = state;
          void navigator.locks.request('5k-compass-auth', async () => {
            state.entered = true; await new Promise<void>(resolve => { state.change = resolve; });
            const response = await fetch('/api/auth/sign-in/email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-compass-session-binding': binding }, body: JSON.stringify({ email, otp }) });
            state.status = response.status; await response.json(); state.changed = true;
            await new Promise<void>(resolve => { state.release = resolve; });
          });
        }, { email: b, otp: code, binding: original.sessionBinding });
        await expect.poll(() => holder.evaluate(() => (window as Holder).centralLock?.entered)).toBe(true);
        expect(await page.evaluate(async () => (await navigator.locks.query()).pending.filter(lock => lock.name === '5k-compass-auth'))).toEqual([]);
        const sent: string[] = [];
        page.on('request', r => {
          const isAuthAction = operation === 'logout' || operation === 'delete-account';
          const relevant = isAuthAction ? r.url().endsWith('/api/auth/sign-out') || (r.method() === 'DELETE' && r.url().endsWith('/api/account')) : r.url().includes('/api/') && !r.url().includes('/api/account/session');
          if (relevant) sent.push(`${r.method()} ${r.url()}`);
        });
        if (operation === 'contextual-read') {
          // Client navigation retains the mounted originating auth view; full reload would bootstrap B.
          // Unlike the form's event catalogue, this endpoint is not already cached by Profile.
          await page.getByRole('link', { name: 'Current Form unavailable: how is it calculated?', exact: true }).evaluate((link: HTMLAnchorElement) => link.click());
        } else {
          const name = { settings: 'Save starting area', add: 'Add performance', edit: 'Save changes', 'delete-performance': 'Delete', export: 'Export my data', 'delete-account': 'Permanently delete my account', logout: 'Sign out' }[operation];
          await page.getByRole('button', { name, exact: true }).evaluate((button: HTMLButtonElement) => button.click());
        }
        await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.some(lock => lock.name === '5k-compass-auth'))).toBe(true);
        expect(sent).toEqual([]);
        await holder.evaluate(() => (window as Holder).centralLock?.change?.());
        await expect.poll(() => holder.evaluate(() => (window as Holder).centralLock?.changed)).toBe(true);
        expect(await holder.evaluate(() => (window as Holder).centralLock?.status)).toBe(200);
        const current = await (await context.request.get('/api/account/session')).json();
        expect(current.sessionBinding).not.toBe(original.sessionBinding);
        expect(current.user.id === original.user.id).toBe(replacement === 'same-account');
        const seedB = await context.request.post('/api/profile/performances', { headers: { origin: 'http://127.0.0.1:5175', [bindingHeader]: current.sessionBinding }, data: { date: '2026-09-22', externalEventName: 'Replacement secret synthetic run', time: '25:00' } });
        expect(seedB.status()).toBe(201);
        const where = { userId: { in: [original.user.id, current.user.id] } };
        const before = {
          users: await db.user.findMany({ where: { id: { in: where.userId.in } }, orderBy: { id: 'asc' } }),
          runs: await db.userPerformance.findMany({ where, orderBy: { id: 'asc' } }),
          sessions: await db.session.findMany({ where, orderBy: { id: 'asc' } }),
        };
        await holder.evaluate(() => (window as Holder).centralLock?.release?.());
        if (operation === 'logout' || operation === 'delete-account') await expect(page.getByText(`Signed in as ${b}`, { exact: true })).toBeVisible();
        else await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
        expect(sent).toEqual([]); expect(downloads).toEqual([]);
        if (operation !== 'logout' && operation !== 'delete-account') await expect(page.getByText('Replacement secret synthetic run', { exact: true })).toHaveCount(0);
        expect(await db.user.findMany({ where: { id: { in: where.userId.in } }, orderBy: { id: 'asc' } })).toEqual(before.users);
        expect(await db.userPerformance.findMany({ where, orderBy: { id: 'asc' } })).toEqual(before.runs);
        expect(await db.session.findMany({ where, orderBy: { id: 'asc' } })).toEqual(before.sessions);
        expect((await (await context.request.get('/api/account/session')).json()).sessionBinding).toBe(current.sessionBinding);
      } finally {
        await holder.evaluate(() => { (window as Holder).centralLock?.change?.(); (window as Holder).centralLock?.release?.(); }).catch(() => undefined);
        await holder.close(); await page.close();
        await db.user.deleteMany({ where: { email: { in: [a, b] } } });
        await db.verification.deleteMany({ where: { identifier: { contains: run } } });
        await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
        await db.$disconnect();
      }
    });
  }
}

for (const operation of ['settings', 'export'] as const) {
  test(`CENTRAL in-flight ${operation} retains cookie lock through response after epoch invalidation`, async ({ page, context }) => {
    const run = randomUUID(); const email = `central-flight-${run}@example.test`;
    const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
    const other = await context.newPage();
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    let captured!: () => void;
    const received = new Promise<void>(resolve => { captured = resolve; });
    const downloads: string[] = []; page.on('download', d => downloads.push(d.suggestedFilename()));
    try {
      await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map(prefix => ({ key: { startsWith: prefix } })) } });
      await page.addInitScript(() => { window.BroadcastChannel = class { onmessage = null; postMessage() {} close() {} } as unknown as typeof BroadcastChannel; });
      await page.goto('/profile'); await login(page, email);
      await other.goto('/profile'); await expect(other.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
      const session = await (await context.request.get('/api/account/session')).json();
      const path = operation === 'settings' ? '/api/profile/settings' : '/api/account/export';
      await page.route(`**${path}`, async route => {
        if (operation === 'settings' && route.request().method() !== 'PATCH') { await route.continue(); return; }
        const response = await route.fetch(); expect(response.status()).toBe(200);
        captured(); await released;
        await route.fulfill({ response });
      });
      if (operation === 'settings') {
        await page.getByLabel('Town or postcode district').fill('In-flight synthetic town');
        await page.getByRole('button', { name: 'Save starting area', exact: true }).click();
      } else await page.getByRole('button', { name: 'Export my data', exact: true }).click();
      await received;
      // Invalidate the originating view while the HTTP response is withheld.
      await page.evaluate(() => window.dispatchEvent(new Event('compass-session-expired')));
      const cookieWrites: string[] = [];
      other.on('request', r => { if (r.url().endsWith('/api/auth/sign-out')) cookieWrites.push(r.url()); });
      await other.getByRole('button', { name: 'Sign out', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
      await expect.poll(() => other.evaluate(async () => (await navigator.locks.query()).pending.some(lock => lock.name === '5k-compass-auth'))).toBe(true);
      expect(cookieWrites).toEqual([]);
      expect((await (await context.request.get('/api/account/session')).json()).sessionBinding).toBe(session.sessionBinding);
      release();
      await expect(other.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
      expect(cookieWrites).toHaveLength(1); expect(downloads).toEqual([]);
      expect((await (await context.request.get('/api/account/session')).json()).user).toBeNull();
      if (operation === 'settings') expect(await db.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ homeLabel: 'In-flight synthetic town' });
    } finally {
      release(); await other.close(); await page.close();
      await db.user.deleteMany({ where: { email } });
      await db.verification.deleteMany({ where: { identifier: { contains: run } } });
      await db.emailAuthBudget.deleteMany({ where: { email } });
      await db.$disconnect();
    }
  });
}

test('CENTRAL private export fails closed when cross-tab Web Locks are unavailable', async ({ page }) => {
  const run = randomUUID(); const email = `central-no-lock-${run}@example.test`;
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  try {
    await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map(prefix => ({ key: { startsWith: prefix } })) } });
    await page.goto('/profile'); await login(page, email);
    await expect(page.getByRole('button', { name: 'Export my data', exact: true })).toBeVisible();
    await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
    const exports: string[] = []; const downloads: string[] = [];
    page.on('request', r => { if (r.url().endsWith('/api/account/export')) exports.push(r.url()); });
    page.on('download', d => downloads.push(d.suggestedFilename()));
    await page.getByRole('button', { name: 'Export my data', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('browser');
    expect(exports).toEqual([]); expect(downloads).toEqual([]);
    expect(await db.user.findUnique({ where: { email } })).not.toBeNull();
  } finally {
    await page.close(); await db.user.deleteMany({ where: { email } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email } }); await db.$disconnect();
  }
});
