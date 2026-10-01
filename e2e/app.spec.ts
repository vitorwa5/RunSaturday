import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Home', () => {
  test('answers "Where are you running?" with an explained best pick', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Where are you running?' })).toBeVisible();
    await expect(page.getByText(/^Saturday \d{1,2} \w+$/)).toBeVisible();
    await expect(page.getByText('DEMO DATA')).toBeVisible();

    const pick = page.getByRole('region', { name: 'Your best pick' });
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeVisible();

    await pick.getByRole('button', { name: 'Why this?' }).click();
    await expect(pick.getByText('Recommended because')).toBeVisible();
    await expect(pick.getByRole('listitem').filter({ hasText: 'PB Score 92/100' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('changing the goal recalculates the pick', async ({ page }) => {
    await page.goto('/');
    const pick = page.getByRole('region', { name: 'Your best pick' });
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeVisible();

    await page.getByRole('radio', { name: 'Quiet' }).click();
    await expect(page.getByRole('radio', { name: 'Quiet' })).toHaveAttribute('aria-checked', 'true');
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeHidden();
    await expect(pick.getByText('Avg runners')).toBeVisible();

    await page.getByRole('radio', { name: 'Challenge' }).click();
    await expect(page.getByText('No pick for this goal yet')).toBeVisible();
  });

  test('lists nearby events and opens an event page', async ({ page }) => {
    await page.goto('/');
    const nearby = page.getByRole('region', { name: 'Near you' });
    await expect(nearby.getByRole('listitem')).toHaveCount(5);
    await nearby.getByRole('link').filter({ hasText: 'Riverside 5K' }).click();
    await expect(page).toHaveURL(/\/event\/demo-riverside-5k$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Riverside 5K' })).toBeVisible();
  });
});

test.describe('Navigation', () => {
  const tabs = [
    { label: 'Home', path: '/', heading: 'Where are you running?' },
    { label: 'Explore', path: '/explore', heading: 'Explore' },
    { label: 'Saturday', path: '/saturday', heading: 'Plan My Saturday' },
    { label: 'Map', path: '/map', heading: 'Map' },
    { label: 'Profile', path: '/profile', heading: 'Profile' },
  ];

  test('bottom navigation has five labelled tabs that work', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText(tabs.map((t) => t.label));

    for (const tab of tabs.toReversed()) {
      await nav.getByRole('link', { name: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/$' : tab.path}$`));
      await expect(page.getByRole('heading', { level: 1, name: tab.heading })).toBeVisible();
      await expect(nav.getByRole('link', { name: tab.label })).toHaveAttribute('aria-current', 'page');
      await expectNoHorizontalScroll(page);
    }
  });

  for (const [path, heading] of [
    ['/pb-finder', 'PB Finder'],
    ['/where-could-i-place', 'Where Could I Place?'],
    ['/hidden-gems', 'Hidden Gems'],
    ['/compare', 'Compare events'],
  ] as const) {
    test(`${path} renders its screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(/Planned for/)).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('unknown routes show a helpful 404', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Explore', () => {
  test('searches events by town', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByText('10 events')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search events' }).fill('chester');
    await expect(page.getByText('1 event matching “chester”')).toBeVisible();
    await expect(page.getByRole('link').filter({ hasText: 'Lakeside 5K' })).toBeVisible();
  });
});

test.describe('Event page', () => {
  test('shows metrics, sample size, and unknown facilities honestly', async ({ page }) => {
    await page.goto('/event/demo-heath-common-5k');
    await expect(page.getByRole('heading', { level: 1, name: 'Heath Common 5K' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Key metrics' }).getByText('PB Score')).toBeVisible();
    await expect(page.getByText(/Based on \d+ events during the last 90 days/)).toBeVisible();

    await page.getByRole('tab', { name: 'Info' }).click();
    await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByText('Unknown').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Results' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('flags a recent cancellation', async ({ page }) => {
    await page.goto('/event/demo-estuary-path-5k');
    await page.getByRole('tab', { name: 'Results' }).click();
    await expect(page.getByRole('cell', { name: 'Cancelled' })).toBeVisible();
  });

  test('handles an unknown event gracefully', async ({ page }) => {
    await page.goto('/event/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();
  });
});
