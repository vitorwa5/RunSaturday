import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPrismaClient } from '../apps/api/src/db/prisma';

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByLabel('Sign-in code')).toBeVisible();
  let otp = '';
  await expect.poll(async () => {
    otp = (await readFile('/tmp/runsaturday-b1-browser-inbox.jsonl', 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { email: string; code: string }).filter((r) => r.email === email).at(-1)?.code ?? '';
    return otp.length;
  }).toBe(6);
  await page.getByLabel('Sign-in code').fill(otp);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
}
async function startingArea(page: Page) {
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByRole('button', { name: 'Explore somewhere new', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your starting area' })).toBeVisible();
}
async function finish(page: Page) {
  await page.getByRole('button', { name: "I'll do this later", exact: true }).click();
  await page.getByRole('button', { name: 'Explore events', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
}
for (const scenario of ['skip', 'location', 'denied'] as const) {
  test(`B3 ${scenario}: honest zero-history onboarding, privacy and settings isolation`, async ({ page, context }) => {
    const run = randomUUID(); const a = `b3-${run}-a@example.test`; const b = `b3-${run}-b@example.test`;
    const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
    try {
      await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map((prefix) => ({ key: { startsWith: prefix } })) } });
      let requests = 0;
      const settingsBodies: object[] = [];
      page.on('request', (request) => { if (request.url().endsWith('/api/profile/settings') && request.method() === 'PATCH') settingsBodies.push(request.postDataJSON()); });
      await page.addInitScript(({ denied }) => {
        (window as typeof window & { geoRequests?: number }).geoRequests = 0;
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) {
          (window as typeof window & { geoRequests: number }).geoRequests++;
          if (denied) failure({ code: 1 } as GeolocationPositionError);
          else success({ coords: { latitude: 53.41234567, longitude: -2.61234567 } } as GeolocationPosition);
        } } });
      }, { denied: scenario === 'denied' });
      await page.goto('/'); await signIn(page, a); await startingArea(page);
      expect(await page.evaluate(() => (window as typeof window & { geoRequests: number }).geoRequests)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Keyboard access and visible focus are checked on the actual location button.
      await page.getByRole('button', { name: 'Use my approximate location' }).focus();
      await expect(page.getByRole('button', { name: 'Use my approximate location' })).toBeFocused();
      if (scenario !== 'skip') {
        await page.getByRole('button', { name: 'Use my approximate location' }).click();
        requests = await page.evaluate(() => (window as typeof window & { geoRequests: number }).geoRequests);
        expect(requests).toBe(1);
      }
      if (scenario === 'location') {
        await expect(page.getByText('Approximate coordinates:', { exact: false })).toContainText('53.40, -2.60');
        await page.getByLabel('Town or postcode district').fill('A private starting area');
        await page.getByLabel('Approx. travel budget').selectOption('45');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        expect(settingsBodies[0]).toMatchObject({ homeLat: 53.4, homeLon: -2.6, defaultTravelMinutes: 45 });
        expect(JSON.stringify(settingsBodies)).not.toContain('41234567');
      } else {
        if (scenario === 'denied') await expect(page.getByRole('status')).toContainText('permission denied');
        await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      }
      await finish(page);
      const user = await db.user.findUniqueOrThrow({ where: { email: a } });
      expect(user).toMatchObject({ homeLat: scenario === 'location' ? 53.4 : null, homeLon: scenario === 'location' ? -2.6 : null });
      expect(user.onboardingCompletedAt).not.toBeNull();
      expect(await db.userPerformance.count({ where: { userId: user.id } })).toBe(0);
      const profile = await (await context.request.get('/api/profile')).json();
      expect(profile).toMatchObject({ runsCompleted: 0, uniqueEventsVisited: 0, savedEventIds: [], lifetimePbSeconds: null, recentPbSeconds: null, currentForm: { status: 'unavailable', formSeconds: null } });
      const challenges = await (await context.request.get('/api/profile/challenges')).json();
      expect(challenges.challenges.find((c: { id: string }) => c.id === 'alphabet').progress).toMatchObject({ current: 0, target: 25 });
      const events = await (await context.request.get('/api/events')).json();
      expect(events.every((e: { source: string }) => e.source !== 'demo')).toBe(true);
      // This suite creates no imported catalogue. Seeded DEMO rows must never fill the gap.
      expect(events).toEqual([]);
      await expect(page.getByText('No events available yet', { exact: true })).toBeVisible();
      if (scenario === 'location') {
        for (const intent of ['pb', 'place', 'new_event', 'challenge', 'quiet', 'hidden_gem', 'surprise']) {
          const saturday = await (await context.request.get(`/api/saturday/recommendations?intent=${intent}`)).json();
          expect(saturday).toMatchObject({ bestPick: null, results: [], message: 'No events available yet.' });
        }
      }
      await page.goto('/profile'); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
      await signIn(page, a); await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
      expect(await (await context.request.get('/api/profile/settings')).json()).toMatchObject({ onboardingCompletedAt: user.onboardingCompletedAt!.toISOString(), homeLat: user.homeLat, homeLon: user.homeLon });
      await page.goto('/'); await expect(page.getByRole('heading', { name: 'Where are you running?' })).toBeVisible();
      if (scenario === 'location') {
        await page.goto('/profile');
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
        await page.evaluate(() => {
          const w = window as typeof window & { b3Flash?: boolean; observer?: MutationObserver }; w.b3Flash = false;
          w.observer = new MutationObserver(() => { if (document.body.innerText.includes('A private starting area') || document.body.innerText.includes('53.40, -2.60') || document.querySelector<HTMLInputElement>('input')?.value === 'A private starting area') w.b3Flash = true; });
          w.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        });
        await signIn(page, b); await page.getByRole('link', { name: 'Finish your welcome setup', exact: true }).click(); await startingArea(page);
        expect(await page.evaluate(() => (window as typeof window & { b3Flash?: boolean }).b3Flash)).toBe(false);
        await expect(page.getByLabel('Town or postcode district')).toHaveValue('');
        const other = await (await context.request.get('/api/profile/settings')).json();
        expect(other).toEqual({ homeLat: null, homeLon: null, homeLabel: null, defaultTravelMinutes: 30, onboardingCompletedAt: null });
      }
    } finally {
      await db.user.deleteMany({ where: { email: { in: [a, b] } } });
      await db.verification.deleteMany({ where: { identifier: { contains: run } } });
      await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
      await db.$disconnect();
    }
  });
}

test('B3 optional manual 5K reuses the existing form and returns safely to welcome', async ({ page, context }) => {
  const run = randomUUID(); const email = `b3-${run}-run@example.test`;
  const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
  try {
    await db.rateLimit.deleteMany({ where: { OR: ['127.0.0.1|', '::1|', '::ffff:127.0.0.1|'].map((prefix) => ({ key: { startsWith: prefix } })) } });
    await page.goto('/'); await signIn(page, email); await startingArea(page);
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
    await page.getByRole('link', { name: 'Add a recent 5K', exact: true }).click();
    const form = page.getByRole('form', { name: 'Add performance' });
    await form.getByRole('radio', { name: 'Other 5K race', exact: true }).click();
    await form.getByLabel('Race name', { exact: true }).fill('Recorded external 5K');
    await form.getByLabel('Date', { exact: true }).fill('2026-09-20');
    await form.getByLabel('Finish time').fill('19:35');
    await form.getByRole('button', { name: 'Add performance', exact: true }).click();
    await expect(page.getByRole('heading', { name: "You're ready", exact: true })).toBeVisible();
    const profile = await (await context.request.get('/api/profile')).json();
    expect(profile).toMatchObject({ runsCompleted: 1, lifetimePbSeconds: 1175, uniqueEventsVisited: 0, currentForm: { status: 'unavailable', formSeconds: null } });
    expect(await (await context.request.get('/api/profile/settings')).json()).toMatchObject({ onboardingCompletedAt: null, homeLat: null, homeLon: null });
    await page.getByRole('button', { name: 'Explore events', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.onboardingCompletedAt).not.toBeNull();
    expect(await db.userPerformance.count({ where: { userId: user.id } })).toBe(1);
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.$disconnect();
  }
});
