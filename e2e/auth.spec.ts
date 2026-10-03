import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';
const inbox = '/tmp/runsaturday-b1-browser-inbox.jsonl';

async function login(page: Page, email: string) {
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByLabel('Sign-in code')).toBeVisible();
  let code = '';
  await expect.poll(async () => {
    const rows = (await readFile(inbox, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { email: string; code: string });
    code = rows.filter((r) => r.email === email).at(-1)?.code ?? '';
    return code.length;
  }).toBe(6);
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
}

test('B1: empty account, persistence, safe switch without a personal-data flash, confirmed deletion', async ({ page, context }, info) => {
  const run = randomUUID();
  const a = `browser-b1-${run}-a@example.test`; const b = `browser-b1-${run}-b@example.test`;
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  try {
    // Each viewport starts with a fresh loopback-IP test budget; production limits stay enabled.
    await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map((prefix) => ({ key: { startsWith: prefix } })) } });
    await page.goto('/profile');
    await login(page, a);
    await expect(page.getByText('No performances yet').first()).toBeVisible();
    const initial = await context.request.get('/api/profile');
    expect(await initial.json()).toMatchObject({ runsCompleted: 0, uniqueEventsVisited: 0, lifetimePbSeconds: null, recentPbSeconds: null, savedEventIds: [], currentForm: { status: 'unavailable' } });
    const challenge = await context.request.get('/api/profile/challenges');
    expect((await challenge.json()).challenges.find((c: { id: string }) => c.id === 'alphabet').progress).toMatchObject({ current: 0, target: 25 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Add performance' }).first().click();
    const form = page.getByRole('form', { name: 'Add performance' });
    await form.getByLabel('Event', { exact: true }).selectOption('demo-riverside-5k');
    await form.getByLabel('Date', { exact: true }).fill('2026-09-20');
    await form.getByLabel('Finish time').fill('19:37');
    await form.getByRole('button', { name: 'Add performance', exact: true }).click();
    await page.goto('/profile');
    await expect(page.getByText('19:37', { exact: true }).first()).toBeVisible();
    const dataA = await (await context.request.get('/api/profile')).json();
    const otherTab = await context.newPage();
    await otherTab.goto('/profile');
    await expect(otherTab.getByText('19:37', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(otherTab.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(otherTab.getByText('19:37', { exact: true })).toHaveCount(0);
    expect((await context.request.get('/api/profile')).status()).toBe(401);
    await login(page, a);
    await expect(page.getByText('19:37', { exact: true }).first()).toBeVisible();
    await expect(otherTab.getByText('19:37', { exact: true }).first()).toBeVisible();
    expect(await (await context.request.get('/api/profile')).json()).toMatchObject({ id: dataA.id, runsCompleted: 1, lifetimePbSeconds: 1177 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(otherTab.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    // Record every DOM mutation throughout B's login, rather than checking only the settled UI.
    await page.evaluate(() => {
      const w = window as typeof window & { personalFlash?: boolean; personalObserver?: MutationObserver };
      w.personalFlash = false;
      w.personalObserver = new MutationObserver(() => { if (document.body.innerText.includes('19:37')) w.personalFlash = true; });
      w.personalObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await login(page, b);
    await expect(otherTab.getByText(`Signed in as ${b}`, { exact: true })).toBeVisible();
    await expect(otherTab.getByText('19:37', { exact: true })).toHaveCount(0);
    await otherTab.close();
    await expect(page.getByText('No performances yet').first()).toBeVisible();
    await expect(page.getByText('19:37', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { personalFlash?: boolean }).personalFlash)).toBe(false);
    const bProfile = await (await context.request.get('/api/profile')).json();
    expect(bProfile).toMatchObject({ runsCompleted: 0, lifetimePbSeconds: null, recentPbSeconds: null, currentForm: { status: 'unavailable' } });
    expect(bProfile.id).not.toBe(dataA.id);
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Permanently delete my account' })).toBeDisabled();
    await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
    await page.getByRole('button', { name: 'Permanently delete my account' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect((await context.request.get('/api/profile')).status()).toBe(401);
    expect(await db.user.findUnique({ where: { email: b } })).toBeNull();
    expect(await db.runnerFormSnapshot.count({ where: { userId: bProfile.id } })).toBe(0);
  } finally {
    await db.user.deleteMany({ where: { email: { in: [a, b] } } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.rateLimit.deleteMany({ where: { key: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.$disconnect();
  }
});
