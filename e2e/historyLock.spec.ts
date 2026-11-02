import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';

type LockState = { entered: boolean; changed: boolean; status?: number; change?: () => void; release?: () => void };
type LockWindow = Window & { historyTestLock?: LockState };
async function codeFor(email: string) {
  const text = await readFile('/tmp/runsaturday-b1-browser-inbox.jsonl', 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return ''; throw error; });
  return text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line)).filter(row => row.email === email).at(-1)?.code ?? '';
}
async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email); await page.getByRole('button', { name: 'Send code', exact: true }).click();
  let code = ''; await expect.poll(async () => { code = await codeFor(email); return code.length; }).toBe(6);
  await page.getByLabel('Sign-in code').fill(code); await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
}
const upload = (page: Page) => page.getByLabel('Choose personal history CSV').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from('date,event_name,time\n2026-09-05,Private queued race,24:31') });

for (const operation of ['preview', 'commit', 'withdrawal'] as const) for (const replacement of ['another-account', 'same-account'] as const) {
  test(`H1 queued ${operation} rejects ${replacement} session replacement before history access`, async ({ page, context }) => {
    const run = randomUUID(); const a = `h1-${run}-a@example.test`; const b = replacement === 'same-account' ? a : `h1-${run}-b@example.test`;
    const db = createPrismaClient(process.env.TEST_DATABASE_URL!); const holder = await context.newPage();
    try {
      await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map(prefix => ({ key: { startsWith: prefix } })) } });
      // Miss every notification: only the post-lock authoritative check can protect A.
      await page.addInitScript(() => {
        window.BroadcastChannel = class { onmessage = null; postMessage() {} close() {} } as unknown as typeof BroadcastChannel;
        window.addEventListener('focus', event => event.stopImmediatePropagation(), true);
      });
      await page.goto('/profile/import-history'); await signIn(page, a);
      const origin = await (await context.request.get('/api/account/session')).json();
      if (operation !== 'preview') {
        await upload(page); await expect(page.getByText('Row 2: NEW', { exact: true })).toBeVisible();
        if (operation === 'withdrawal') {
          await page.getByRole('checkbox', { name: /I confirm this file/ }).check(); await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
          await page.getByRole('checkbox', { name: /Remove all my CSV/ }).check();
        } else await page.getByRole('checkbox', { name: /I confirm this file/ }).check();
      }
      await holder.goto('/profile/import-history'); await expect(holder.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
      expect((await context.request.post('/api/auth/email-otp/send-verification-otp', { headers: { origin: 'http://127.0.0.1:5175' }, data: { email: b } })).status()).toBe(200);
      let otp = ''; await expect.poll(async () => { otp = await codeFor(b); return otp.length; }).toBe(6);
      await holder.evaluate(({ email, code }) => {
        const state: LockState = { entered: false, changed: false }; (window as LockWindow).historyTestLock = state;
        void navigator.locks.request('5k-compass-auth', async () => {
          state.entered = true;
          await new Promise<void>(resolve => { state.change = resolve; });
          // The holder performs the cookie-changing request inside the real shared lock.
          const response = await fetch('/api/auth/sign-in/email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp: code }) });
          state.status = response.status; await response.json(); state.changed = true;
          await new Promise<void>(resolve => { state.release = resolve; });
        });
      }, { email: b, code: otp });
      await expect.poll(() => holder.evaluate(() => (window as LockWindow).historyTestLock?.entered)).toBe(true);
      const sent: string[] = []; page.on('request', r => { if (r.url().includes('/api/profile/history-import')) sent.push(r.url()); });
      if (operation === 'preview') await upload(page);
      else await page.getByRole('button', { name: operation === 'commit' ? 'Confirm import' : 'Remove my CSV history', exact: true }).click();
      await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.some(lock => lock.name === '5k-compass-auth') ?? false)).toBe(true);
      expect(sent).toHaveLength(0);
      await holder.evaluate(() => (window as LockWindow).historyTestLock?.change?.());
      await expect.poll(() => holder.evaluate(() => (window as LockWindow).historyTestLock?.changed)).toBe(true);
      expect(await holder.evaluate(() => (window as LockWindow).historyTestLock?.status)).toBe(200);
      const current = await (await context.request.get('/api/account/session')).json();
      expect(current.sessionBinding).not.toBe(origin.sessionBinding);
      expect(current.user.id === origin.user.id).toBe(replacement === 'same-account');
      const seeded = await context.request.post('/api/profile/history-import/commit', { headers: { origin: 'http://127.0.0.1:5175' }, data: { sessionBinding: current.sessionBinding, confirmation: 'IMPORT MY OWN HISTORY', rows: [{ row: 2, date: '2026-09-12', eventName: 'Replacement private run', time: '25:00' }] } });
      expect(seeded.status()).toBe(200);
      const where = { userId: { in: [origin.user.id, current.user.id] } }; const orderBy = { id: 'asc' as const };
      const before = await db.userPerformance.findMany({ where, orderBy });
      await holder.evaluate(() => (window as LockWindow).historyTestLock?.release?.());
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
      expect(sent).toHaveLength(0);
      expect(await db.userPerformance.findMany({ where, orderBy })).toEqual(before);
      expect((await (await context.request.get('/api/account/session')).json()).sessionBinding).toBe(current.sessionBinding);
      await expect(page.getByText('Replacement private run', { exact: true })).toHaveCount(0);
    } finally {
      await holder.evaluate(() => { const state = (window as LockWindow).historyTestLock; state?.change?.(); state?.release?.(); }).catch(() => undefined);
      await holder.close(); await page.close();
      await db.user.deleteMany({ where: { email: { in: [a, b] } } });
      await db.verification.deleteMany({ where: { identifier: { contains: run } } }); await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } }); await db.$disconnect();
    }
  });
}
