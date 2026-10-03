import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';
import { CatalogueImportService } from '../apps/api/src/catalogue/importService';
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
  const catalogueNamespace = `browser-fixture-${run}`;
  try {
    const catalogue = { format: '5k-compass-catalogue-v1', source: { namespace: catalogueNamespace, kind: 'imported', attribution: 'Synthetic browser test source' }, records: [
      { externalId: 'test-event', name: 'Aster Synthetic Saturday 5K', countryCode: 'GB', region: 'Northern Ireland', subdivisionCode: 'GB-NIR', latitude: 54.6, longitude: -5.9, timezone: 'Europe/London', active: true },
    ] };
    await new CatalogueImportService(db, 'beta').import(catalogue);
    const eventId = (await db.event.findUniqueOrThrow({ where: { sourceNamespace_externalId: { sourceNamespace: catalogueNamespace, externalId: 'test-event' } } })).id;
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
    await page.goto(`/event/${eventId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Aster Synthetic Saturday 5K' })).toBeVisible();
    await expect(page.getByText('Catalogue information only', { exact: true })).toBeVisible();
    await expect(page.getByText('Scores not yet calculated.', { exact: true })).toBeVisible();
    await expect(page.getByText('DEMO', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Info', exact: true }).click();
    await expect(page.getByText('Synthetic browser test source', { exact: true })).toBeVisible();
    await expect(page.getByText('Europe/London', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await (await context.request.get(`/api/events/${eventId}/analytics`)).json()).toMatchObject({ pb: null, competition: null, courseSpeed: null, difficulty: null });
    await page.goto('/profile');
    await page.getByRole('link', { name: 'Add performance' }).first().click();
    const form = page.getByRole('form', { name: 'Add performance' });
    await form.getByLabel('Event', { exact: true }).selectOption(eventId);
    await form.getByLabel('Date', { exact: true }).fill('2026-09-20');
    await form.getByLabel('Finish time').fill('19:37');
    await form.getByRole('button', { name: 'Add performance', exact: true }).click();
    await page.goto('/profile');
    await expect(page.getByText('19:37', { exact: true }).first()).toBeVisible();
    const dataA = await (await context.request.get('/api/profile')).json();
    const performanceId = (await (await context.request.get('/api/profile/performances')).json()).performances[0].id;
    await new CatalogueImportService(db, 'beta').import({ ...catalogue, records: catalogue.records.map((r) => ({ ...r, active: false })) });
    await page.goto(`/profile/performances/${performanceId}/edit`);
    const edit = page.getByRole('form', { name: 'Edit performance' });
    await expect(edit.getByLabel('Event', { exact: true })).toHaveValue(eventId);
    await expect(edit.getByRole('option', { name: 'Aster Synthetic Saturday 5K (not in active catalogue)', exact: true })).toHaveCount(1);
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Profile', exact: true })).toBeVisible();
    expect(await db.userPerformance.findUnique({ where: { id: performanceId } })).toMatchObject({ eventId, finishTimeSeconds: 1177 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect((await context.request.get('/api/profile')).status()).toBe(401);
    await login(page, a);
    await expect(page.getByText('19:37', { exact: true }).first()).toBeVisible();
    expect(await (await context.request.get('/api/profile')).json()).toMatchObject({ id: dataA.id, runsCompleted: 1, lifetimePbSeconds: 1177 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    // Record every DOM mutation throughout B's login, rather than checking only the settled UI.
    await page.evaluate(() => {
      const w = window as typeof window & { personalFlash?: boolean; personalObserver?: MutationObserver };
      w.personalFlash = false;
      w.personalObserver = new MutationObserver(() => { if (document.body.innerText.includes('19:37')) w.personalFlash = true; });
      w.personalObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await login(page, b);
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
    await db.event.deleteMany({ where: { sourceNamespace: catalogueNamespace } });
    await db.catalogueImportRun.deleteMany({ where: { sourceNamespace: catalogueNamespace } });
    await db.$disconnect();
  }
});
