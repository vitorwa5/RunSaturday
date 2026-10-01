import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const bestPick = (page: Page) => page.getByRole('region', { name: 'Your best pick' });

test.describe('Home', () => {
  test('answers "Where are you running?" with an explained best pick', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('5K Compass · Your guide to Saturday 5Ks');
    await expect(page.getByText('5K Compass', { exact: true })).toBeVisible();
    await expect(page.getByText('Your guide to Saturday 5Ks.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Where are you running?' })).toBeVisible();
    await expect(page.getByText(/^Saturday, \d{1,2} \w+$/)).toBeVisible();
    await expect(page.getByText('DEMO DATA')).toBeVisible();

    const pick = bestPick(page);
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeVisible();
    await expect(pick.getByText('PB opportunity')).toBeVisible();
    await expect(pick.getByText('Fast · Flat · Tarmac')).toBeVisible();
    await expect(pick.getByText('Demo recommendation · ranked using PB Score')).toBeVisible();
    // No fake Saturday Score.
    await expect(page.getByText(/Saturday Score/i)).toHaveCount(0);

    const why = pick.getByRole('button', { name: 'Why this?' });
    await expect(pick.getByText('Recommended because')).toBeHidden();
    await why.click();
    await expect(why).toHaveAttribute('aria-expanded', 'true');
    await expect(pick.getByRole('listitem').filter({ hasText: 'High PB Score (92/100)' })).toBeVisible();
    await why.click();
    await expect(pick.getByText('Recommended because')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('changing the goal recalculates the pick and options', async ({ page }) => {
    await page.goto('/');
    const pick = bestPick(page);
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeVisible();

    await page.getByRole('radio', { name: /Quiet/ }).click();
    await expect(page.getByRole('radio', { name: /Quiet/ })).toHaveAttribute('aria-checked', 'true');
    await expect(pick.getByText('Average runners', { exact: true })).toBeVisible();
    await expect(pick.getByRole('heading', { name: 'Riverside 5K' })).toBeHidden();

    await page.getByRole('radio', { name: /Challenge/ }).click();
    await expect(page.getByRole('heading', { name: "Challenge isn't available yet" })).toBeVisible();
    await expect(bestPick(page)).toHaveCount(0);
  });

  test('shows other options that open the event page', async ({ page }) => {
    await page.goto('/');
    const options = page.getByRole('region', { name: 'Other options' });
    await expect(options.getByRole('listitem')).toHaveCount(3);
    await options.getByRole('listitem').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/event\/demo-/);
    await expect(page.getByRole('region', { name: 'Key metrics' })).toBeVisible();
  });
});

test.describe('Saturday Planner', () => {
  test('ranks events with explanations using the profile defaults', async ({ page }) => {
    await page.goto('/saturday');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan My Saturday' })).toBeVisible();
    await expect(page.getByText('Starting from')).toBeVisible();
    await expect(page.getByText('Warrington (demo home)')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Maximum estimated travel' }).getByRole('radio', { name: '45 min' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'Current location · Later' })).toBeDisabled();

    const first = page.getByRole('article').first();
    await expect(first).toHaveAccessibleName('Rank 1: Riverside 5K');
    await first.getByRole('button', { name: 'Why this?' }).click();
    await expect(first.getByText('Within your travel limit (about 6 of 45 min, estimated)')).toBeVisible();
    await expect(page.getByText(/not driving directions/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('travel limit and goal update results and are kept in the URL', async ({ page }) => {
    await page.goto('/saturday');
    const results = page.getByRole('article');
    await expect(results.first()).toBeVisible();
    const before = await results.count();

    await page.getByRole('radiogroup', { name: 'Maximum estimated travel' }).getByRole('radio', { name: '15 min' }).click();
    await expect(page).toHaveURL(/travel=15/);
    await expect.poll(() => results.count()).toBeLessThan(before);

    await page.getByRole('radiogroup', { name: 'Goal' }).getByRole('radio', { name: /High Finish/ }).click();
    await expect(page).toHaveURL(/goal=place/);
    await expect(results.first().getByText('Competition', { exact: true }).first()).toBeVisible();

    // Selections survive opening an event and coming back.
    await results.first().getByRole('link', { name: 'View event' }).click();
    await expect(page).toHaveURL(/\/event\//);
    await page.goBack();
    await expect(page.getByRole('radiogroup', { name: 'Maximum estimated travel' }).getByRole('radio', { name: '15 min' })).toHaveAttribute('aria-checked', 'true');
  });

  test('filters narrow results, and an empty result offers a reset', async ({ page }) => {
    await page.goto('/saturday?travel=90');
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.getByRole('button', { name: /Advanced filters/ }).click();
    await page.getByRole('radiogroup', { name: 'Surface' }).getByRole('radio', { name: 'Trail' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);

    await page.getByRole('radiogroup', { name: 'Maximum estimated travel' }).getByRole('radio', { name: '15 min' }).click();
    await expect(page.getByRole('heading', { name: 'No events match these filters.' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).last().click();
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page).not.toHaveURL(/surface=/);
  });

  test('later Saturdays can be chosen', async ({ page }) => {
    await page.goto('/saturday');
    const dates = page.getByRole('radiogroup', { name: 'Date' }).getByRole('radio');
    await expect(dates).toHaveCount(4);
    await dates.nth(1).click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('article').first()).toBeVisible();
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
  test('leads with primary metrics, an honest outlook and historical medians', async ({ page }) => {
    await page.goto('/event/demo-heath-common-5k');
    await expect(page.getByRole('heading', { level: 1, name: 'Heath Common 5K' })).toBeVisible();
    const metrics = page.getByRole('region', { name: 'Key metrics' });
    for (const label of ['PB Score', 'Difficulty', 'Competition']) await expect(metrics.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save/ })).toBeDisabled();

    const outlook = page.getByRole('region', { name: 'Your outlook' });
    await expect(outlook.getByText('19:40', { exact: true })).toBeVisible();
    await expect(outlook.getByText('Typical historical position')).toBeVisible();
    await expect(outlook.getByText(/\d+ of \d+ events/)).toBeVisible();
    // Expected time still needs a course-adjustment model.
    await expect(outlook.getByText('Not available yet')).toHaveCount(1);
    await expect(outlook.getByRole('link', { name: 'Where else could I place?' })).toBeVisible();
    await expect(page.getByText(/you will finish/i)).toHaveCount(0);

    await expect(page.getByText('Median winner')).toBeVisible();
    await expect(page.getByText(/Based on \d+ events in the last 90 days/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('results tab switches period and explains limited history', async ({ page }) => {
    await page.goto('/event/demo-riverside-5k');
    await page.getByRole('tab', { name: 'Results' }).click();
    const periods = page.getByRole('radiogroup', { name: 'Time period' });
    await expect(periods.getByRole('radio', { name: '90d' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Based on 13 events in the last 90 days/)).toBeVisible();

    await periods.getByRole('radio', { name: '30d' }).click();
    await expect(page.getByText(/events? in the last 30 days/)).toBeVisible();

    await periods.getByRole('radio', { name: 'All' }).click();
    await expect(page.getByText(/Stored history starts on/)).toBeVisible();
    await page.getByRole('button', { name: 'Show all 26 dates' }).click();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(27);
  });

  test('course and info tabs never invent data', async ({ page }) => {
    await page.goto('/event/demo-heath-common-5k');
    await page.getByRole('tab', { name: 'Course' }).click();
    await expect(page.getByText('Estimated course adjustment')).toBeVisible();
    await expect(page.getByText('Coming in a later phase')).toHaveCount(3);

    await page.getByRole('tab', { name: 'Info' }).click();
    await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByText('Unknown', { exact: true })).toHaveCount(7);
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

test.describe('Where Could I Place?', () => {
  test('Home → tool → enter a time → historical results → Event', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Saturday tools' }).getByRole('link', { name: 'Where Could I Place?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Where Could I Place?' })).toBeVisible();
    // Defaults to current form from the profile.
    await expect(page.getByRole('radio', { name: 'Current form 19:40' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('article').first()).toBeVisible();

    await page.getByRole('radio', { name: 'Enter a time' }).click();
    const input = page.getByLabel('Your 5K time');
    await input.fill('19:75');
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a time like 19:30 or 1:05:30.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('21:00');
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page).toHaveURL(/src=manual&time=1260/);
    await expect(page.getByText(/Historically, 21:00 would have placed like this/)).toBeVisible();
    const first = page.getByRole('article').first();
    await expect(first.getByText('Typical position')).toBeVisible();
    await expect(first.getByText(/High|Medium|Low|Limited data/).first()).toBeVisible();
    // Historical counts only; no probability wording anywhere.
    await expect(page.getByText(/chance|probability|you will finish/i)).toHaveCount(0);

    await first.getByRole('button', { name: 'History' }).click();
    await expect(first.getByText('Historically, this time would have placed')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await first.getByRole('link', { name: 'View event' }).click();
    await expect(page).toHaveURL(/\/event\/demo-/);
    await expect(page.getByRole('region', { name: 'Your outlook' }).getByText('Typical historical position')).toBeVisible();
  });

  test('period and target change the analysis', async ({ page }) => {
    await page.goto('/where-could-i-place?src=manual&time=1260');
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Target' }).getByRole('radio', { name: 'Top 5' }).click();
    await expect(page.getByRole('article').first().getByText('Top 5 historically')).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: '30d' }).click();
    await expect(page).toHaveURL(/window=30/);
    await expect(page.getByText(/over the last 30 days/)).toBeVisible();
  });

  test('links into Compare with the time', async ({ page }) => {
    await page.goto('/where-could-i-place?src=manual&time=1260');
    await page.getByRole('link', { name: 'Compare events' }).click();
    await expect(page).toHaveURL(/\/compare\?ids=.+&time=1260/);
    await expect(page.getByRole('table').getByRole('rowheader', { name: 'Median position' })).toBeVisible();
  });
});

test.describe('PB Finder', () => {
  test('Home → PB Finder → Event, with demo labelling and Why this?', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Saturday tools' }).getByRole('link', { name: 'PB Finder' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'PB Finder' })).toBeVisible();
    await expect(page.getByText('Using demo PB Scores')).toBeVisible();
    const first = page.getByRole('article').first();
    await expect(first).toHaveAccessibleName('Rank 1: Riverside 5K');
    await expect(first.getByText('Demo PB Score')).toBeVisible();
    await first.getByRole('button', { name: 'Why this?' }).click();
    await expect(first.getByText('High PB Score (92/100)')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await first.getByRole('link', { name: 'View event' }).click();
    await expect(page).toHaveURL(/\/event\/demo-riverside-5k$/);
  });

  test('sorting and filters update results', async ({ page }) => {
    await page.goto('/pb-finder?travel=90');
    await page.getByRole('radiogroup', { name: 'Sort by' }).getByRole('radio', { name: 'Elevation' }).click();
    await expect(page).toHaveURL(/sort=elevation/);
    await expect(page.getByText(/sorted by elevation/)).toBeVisible();
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('radiogroup', { name: 'Surface' }).getByRole('radio', { name: 'Trail' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });
});

test.describe('Hidden Gems', () => {
  test('explains each gem, shows the breakdown, and opens the event', async ({ page }) => {
    await page.goto('/hidden-gems');
    await expect(page.getByRole('heading', { level: 1, name: 'Hidden Gems' })).toBeVisible();
    const first = page.getByRole('article').first();
    await expect(first.getByText("Why it's a gem")).toBeVisible();
    await first.getByRole('button', { name: 'Breakdown' }).click();
    for (const label of ['Placement opportunity', 'Small field', 'Travel convenience', 'Reliability', 'New to you']) {
      await expect(first.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/hidden_gem_v1\), not an official parkrun metric/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await first.getByRole('link', { name: 'View event' }).click();
    await expect(page).toHaveURL(/\/event\/demo-/);
  });

  test('modes filter the gems', async ({ page }) => {
    await page.goto('/hidden-gems?travel=90');
    await expect(page.getByRole('article').first()).toBeVisible();
    const all = await page.getByRole('article').count();
    await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Small field' }).click();
    await expect(page).toHaveURL(/mode=small_field/);
    await expect.poll(() => page.getByRole('article').count()).toBeLessThan(all);
  });
});

test.describe('Compare', () => {
  test('Saturday Planner → Compare top 3', async ({ page }) => {
    await page.goto('/saturday');
    await page.getByRole('link', { name: 'Compare top 3' }).click();
    await expect(page).toHaveURL(/\/compare\?ids=[^,]+,[^,]+,[^,&]+$/);
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveCount(4);
    await expectNoHorizontalScroll(page);
  });

  test('choose 2–4 events, with the limit enforced and selections kept in the URL', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.getByRole('heading', { name: 'Choose at least 2 events' })).toBeVisible();
    const picker = page.getByRole('region', { name: 'Choose events to compare' });
    const option = (name: string) => picker.getByRole('button', { name: new RegExp(`^${name}`) });

    await option('Riverside 5K').click();
    await option('Lakeside 5K').click();
    await expect(page.getByRole('table')).toBeVisible();
    await option('Estuary Path 5K').click();
    await option('Canal Towpath 5K').click();
    await expect(picker.getByText('4 of 4 selected')).toBeVisible();
    await expect(option('Forest Trail 5K')).toBeDisabled();
    await picker.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByRole('table').getByRole('columnheader')).toHaveCount(5);
    await expect(page).toHaveURL(/ids=demo-riverside-5k,demo-lakeside-5k,demo-estuary-path-5k,demo-canal-towpath-5k/);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Remove Lakeside 5K' }).click();
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveCount(4);

    // Historical placement rows appear with a runner time, and disappear without one.
    await expect(page.getByRole('rowheader', { name: 'Median position' })).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Runner time' }).getByRole('radio', { name: 'No time' }).click();
    await expect(page.getByRole('rowheader', { name: 'Median position' })).toHaveCount(0);
    await expect(page.getByText(/expected (race )?time/i)).toHaveCount(0);
  });

  test('reports events that no longer exist', async ({ page }) => {
    await page.goto('/compare?ids=demo-riverside-5k,demo-lakeside-5k,gone-event');
    await expect(page.getByText('An event could not be found')).toBeVisible();
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveCount(3);
  });
});
