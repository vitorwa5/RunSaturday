import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';
import { CatalogueImportService } from '../apps/api/src/catalogue/importService';
async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  let code = '';
  await expect.poll(async () => { code = (await readFile('/tmp/runsaturday-b1-browser-inbox.jsonl', 'utf8')).trim().split('\n').map(l => JSON.parse(l)).filter(r => r.email === email).at(-1)?.code ?? ''; return code.length; }).toBe(6);
  await page.getByLabel('Sign-in code').fill(code); await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import my 5K history', exact: true })).toBeVisible();
}
const upload = (page: Page, text: string) => page.getByLabel('Choose personal history CSV').setInputFiles({ name: 'synthetic-history.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
async function confirm(page: Page) {
  await page.getByRole('checkbox', { name: /I confirm this file/ }).check();
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();
}
async function clearIp(db: ReturnType<typeof createPrismaClient>) {
  await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map(prefix => ({ key: { startsWith: prefix } })) } });
}
test('B4 private import, reimport, correction, mixed rows, ambiguous mapping and withdrawal', async ({ page, context }) => {
  const run = randomUUID(); const email = `b4-${run}@example.test`; const namespace = `b4-browser-${run}`;
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  try {
    await clearIp(db);
    await new CatalogueImportService(db, 'beta').import({ format: '5k-compass-catalogue-v1', source: { namespace, kind: 'imported', attribution: 'Synthetic B4 browser fixtures' }, records: ['a', 'b'].map(id => ({ externalId: id, name: 'Ambiguous Synthetic Park', town: id === 'a' ? 'Town A' : 'Town B', countryCode: 'GB', timezone: 'Europe/London', latitude: 53, longitude: -2, active: true })) });
    await page.goto('/profile/import-history'); await signIn(page, email);
    const bodies: object[] = []; page.on('request', r => { if (r.url().includes('/history-import/') && r.method() === 'POST') bodies.push(r.postDataJSON()); });
    const csv = 'date,event_name,time,position,distance_m\r\n2026-09-05,"Private race, West",24:31,87,5000\r\n2026-09-12,Ambiguous Synthetic Park,23:58,,\r\n2026-02-30,Invalid race,24:00,,5000';
    await upload(page, csv); await expect(page.getByRole('heading', { name: 'Preview: 3 rows' })).toBeVisible();
    await expect(page.getByText('Row 4: INVALID', { exact: true })).toBeVisible();
    await page.getByLabel('Mapping for Ambiguous Synthetic Park').selectOption('external');
    await expect(page.getByRole('heading', { name: 'Preview: 3 rows' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('checkbox', { name: /I confirm this file/ }).focus();
    await expect(page.getByRole('checkbox', { name: /I confirm this file/ })).toBeFocused();
    await confirm(page);
    await expect(page.getByRole('status')).toContainText('New 2'); await expect(page.getByRole('status')).toContainText('Invalid 1');
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const records = await db.userPerformance.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(2); expect(records.every(r => r.source === 'CSV' && !r.verified && r.eventId === null)).toBe(true);
    expect(bodies.every(body => !JSON.stringify(body).includes('date,event_name,time') && !JSON.stringify(body).includes('synthetic-history.csv'))).toBe(true);
    await upload(page, csv); await expect(page.getByRole('heading', { name: 'Preview: 3 rows' })).toBeVisible(); await confirm(page);
    await expect(page.getByRole('status')).toContainText('Unchanged 2'); expect(await db.userPerformance.count({ where: { userId: user.id } })).toBe(2);
    await upload(page, csv.replace('24:31', '22:31')); await expect(page.getByText('Row 2: UPDATE', { exact: true })).toBeVisible(); await confirm(page);
    expect(await db.userPerformance.findUnique({ where: { id: records.find(r => r.date.toISOString().startsWith('2026-09-05'))!.id } })).toMatchObject({ finishTimeSeconds: 1351 });
    // Persist an ambiguous choice, then replay the file without repeating the decision.
    const mapped = await db.event.findUniqueOrThrow({ where: { sourceNamespace_externalId: { sourceNamespace: namespace, externalId: 'a' } } });
    const correctedCsv = csv.replace('24:31', '22:31');
    await upload(page, correctedCsv); await expect(page.getByRole('heading', { name: 'Preview: 3 rows' })).toBeVisible();
    await page.getByLabel('Mapping for Ambiguous Synthetic Park').selectOption(mapped.id);
    await expect(page.getByText('Row 3: UPDATE', { exact: true })).toBeVisible(); await confirm(page);
    await upload(page, correctedCsv); await expect(page.getByText('Row 3: UNCHANGED', { exact: true })).toBeVisible(); await confirm(page);
    await expect(page.getByRole('status')).toContainText('Unchanged 2');
    expect(await db.userPerformance.findUnique({ where: { id: records.find(r => r.date.toISOString().startsWith('2026-09-12'))!.id } })).toMatchObject({ eventId: mapped.id });
    const manual = await context.request.post('/api/profile/performances', { headers: { origin: 'http://127.0.0.1:5175' }, data: { date: '2026-09-18', externalEventName: 'Manual synthetic race', time: '25:00' } });
    expect(manual.status()).toBe(201);
    await page.getByRole('checkbox', { name: /Remove all my CSV/ }).check(); await page.getByRole('button', { name: 'Remove my CSV history', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Removed 2');
    expect(await db.userPerformance.findMany({ where: { userId: user.id }, select: { source: true } })).toEqual([{ source: 'MANUAL' }]);
    expect(await db.event.count({ where: { sourceNamespace: namespace } })).toBe(2);
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page.getByText('Manual synthetic race', { exact: true }).first()).toBeVisible();
  } finally {
    await db.user.deleteMany({ where: { email } }); await db.event.deleteMany({ where: { sourceNamespace: namespace } }); await db.catalogueImportRun.deleteMany({ where: { sourceNamespace: namespace } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } }); await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } }); await db.$disconnect();
  }
});

for (const operation of ['preview', 'commit'] as const) test(`B4 delayed A ${operation} cannot appear or be committed under B`, async ({ page }) => {
  const run = randomUUID(); const a = `b4-${run}-a@example.test`; const b = `b4-${run}-b@example.test`; const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  let release!: () => void; let arrived!: () => void;
  const barrier = new Promise<void>(r => { release = r; }); const intercepted = new Promise<void>(r => { arrived = r; });
  try {
    await clearIp(db); await page.goto('/profile/import-history'); await signIn(page, a);
    if (operation === 'commit') { await upload(page, 'date,event_name,time\n2026-09-05,A private delayed race,24:31'); await expect(page.getByRole('heading', { name: 'Preview: 1 rows' })).toBeVisible(); }
    await page.route(`**/api/profile/history-import/${operation}`, async route => { const response = await route.fetch(); arrived(); await barrier; await route.fulfill({ response }).catch(() => undefined); });
    if (operation === 'preview') await upload(page, 'date,event_name,time\n2026-09-05,A private delayed race,24:31');
    else { await page.getByRole('checkbox', { name: /I confirm this file/ }).check(); await page.getByRole('button', { name: 'Confirm import', exact: true }).click(); }
    await intercepted;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await signIn(page, b); release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByText('A private delayed race', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm import', exact: true })).toHaveCount(0);
    expect(await db.userPerformance.count({ where: { user: { email: b } } })).toBe(0);
    expect(await db.userPerformance.count({ where: { user: { email: a } } })).toBe(operation === 'commit' ? 1 : 0);
    await expect(page.getByRole('heading', { name: 'Import complete' })).toHaveCount(0);
  } finally {
    release?.(); await db.user.deleteMany({ where: { email: { in: [a, b] } } }); await db.verification.deleteMany({ where: { identifier: { contains: run } } }); await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } }); await db.$disconnect();
  }
});
