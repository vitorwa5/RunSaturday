import { expect, test, type Page } from '@playwright/test';

async function expectMobileFrame(page: Page) {
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('id', 'main-content');
  await expect(main).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByText('DEMO DATA', { exact: true })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(navigation.getByRole('link')).toHaveCount(5);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  for (const link of await navigation.getByRole('link').all()) {
    await expect(link).toHaveAccessibleName(/\S/);
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
}

test('release mobile keyboard navigation, skip link and search keep useful focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Where are you running?' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toBeFocused();
  // The skip link precedes main in keyboard order and activates without a route/hash change.
  await page.keyboard.press('Shift+Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skip).toBeFocused(); await expect(skip).toBeVisible();
  await page.keyboard.press('Enter'); await expect(main).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
  for (const [name, heading] of [['Explore', 'Explore'], ['Saturday', 'Plan My Saturday'], ['Map', 'Map'], ['Profile', 'Profile']] as const) {
    const link = navigation.getByRole('link', { name, exact: true });
    await link.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(main).toBeFocused();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expectMobileFrame(page);
  }
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Map', exact: true })).toBeVisible();
  await expect(main).toBeFocused();
  await navigation.getByRole('link', { name: 'Explore', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search events', exact: true });
  await search.focus(); await page.keyboard.type('No matching event anywhere 94721');
  await expect(page.getByRole('heading', { name: 'No events match “No matching event anywhere 94721”', exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill('Riverside');
  await expect(page.getByRole('link').filter({ hasText: 'Riverside 5K' }).first()).toBeVisible();
  await expect(search).toBeFocused();
});

test('release product surface matrix retains mobile landmarks, labels and honest DEMO provenance', async ({ page }) => {
  const cases = [
    ['/', 'Where are you running?'],
    ['/explore', 'Explore'],
    ['/challenges', 'My Challenges'],
    ['/saturday', 'Plan My Saturday'],
    ['/pb-finder', 'PB Finder'],
    ['/where-could-i-place?src=manual&time=1260', 'Where Could I Place?'],
    ['/hidden-gems', 'Hidden Gems'],
    ['/compare?ids=demo-riverside-5k,demo-lakeside-5k', 'Compare events'],
    ['/event/demo-riverside-5k', 'Riverside 5K'],
    ['/profile', 'Profile'],
    ['/profile/performances/new', 'Add performance'],
  ] as const;
  for (const [path, heading] of cases) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('main')).toBeFocused();
      await expectMobileFrame(page);
      // A visible control with an empty name is unusable to voice/screen-reader users.
      for (const control of await page.locator('main input:not([type="hidden"]), main select, main textarea, main button').all()) {
        if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
      }
    });
  }
});
