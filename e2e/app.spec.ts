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
    await expect(pick.getByRole('heading', { name: 'Dockside Promenade 5K' })).toBeVisible();
    await expect(pick.getByText('PB opportunity')).toBeVisible();
    await expect(pick.getByText('Fast · Flat · Tarmac')).toBeVisible();
    await expect(pick.getByText('Demo recommendation · ranked using PB Score')).toBeVisible();
    // No fake Saturday Score.
    await expect(page.getByText(/Saturday Score/i)).toHaveCount(0);

    const why = pick.getByRole('button', { name: 'Why this?' });
    await expect(pick.getByText('Recommended because')).toBeHidden();
    await why.click();
    await expect(why).toHaveAttribute('aria-expanded', 'true');
    await expect(pick.getByRole('listitem').filter({ hasText: 'High PB Score (100/100)' })).toBeVisible();
    await why.click();
    await expect(pick.getByText('Recommended because')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('changing the goal recalculates the pick and options', async ({ page }) => {
    await page.goto('/');
    const pick = bestPick(page);
    await expect(pick.getByRole('heading', { name: 'Dockside Promenade 5K' })).toBeVisible();

    await page.getByRole('radio', { name: /Quiet/ }).click();
    await expect(page.getByRole('radio', { name: /Quiet/ })).toHaveAttribute('aria-checked', 'true');
    await expect(pick.getByText('Average runners', { exact: true })).toBeVisible();
    await expect(pick.getByRole('heading', { name: 'Dockside Promenade 5K' })).toBeHidden();

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
    await expect(first).toHaveAccessibleName('Rank 1: Dockside Promenade 5K');
    await first.getByRole('button', { name: 'Why this?' }).click();
    await expect(first.getByText('Within your travel limit (about 45 of 45 min, estimated)')).toBeVisible();
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
    await expect(metrics.getByText('Historically slower relative to the analysed course cohort')).toBeVisible();
    await expect(page.getByText(/% (faster|slower) than/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save/ })).toBeDisabled();

    const outlook = page.getByRole('region', { name: 'Your outlook' });
    await expect(outlook.getByText('19:40', { exact: true })).toBeVisible();
    await expect(outlook.getByText('Typical historical position')).toBeVisible();
    await expect(outlook.getByText(/\d+ of \d+ events/)).toBeVisible();
    // Recent best converted with Course Speed Factors: an equivalent, never a predicted finish.
    await expect(outlook.getByText('Equivalent 5K here')).toBeVisible();
    await expect(outlook.getByText(/^≈ \d{2}:\d{2}$/)).toBeVisible();
    await expect(outlook.getByText(/^Adjusted from 19:32 at Riverside 5K \(\+\d:\d{2}\)$/)).toBeVisible();
    await expect(page.getByText(/predicted finish/i)).toHaveCount(1); // only the "not a predicted finish time" note
    await expect(outlook.getByText(/not a predicted finish time/)).toBeVisible();
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
    await expect(page.getByText(/Based on 1[2-3] events in the last 90 days/)).toBeVisible();

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
    // Course speed is now measured (no estimate from elevation); map and profile are still to come.
    await expect(page.getByText('Course speed', { exact: true })).toBeVisible();
    await expect(page.getByText(/Historically slower relative to the analysed course cohort, from runners who also ran other events/)).toBeVisible();
    await expect(page.getByText(/not a neutral course/)).toBeVisible();
    await expect(page.getByText('Coming in a later phase')).toHaveCount(2);

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
    await expect(page.getByRole('radio', { name: 'Current form (estimate) 19:40' })).toHaveAttribute('aria-checked', 'true');
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
    await expect(first.getByText('Historically, 21:00 would have placed')).toBeVisible();
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
    await expect(page.getByText('PB Score V1: 75% observed course speed, 25% structural ease')).toBeVisible();
    await expect(page.getByText(/demo PB/i)).toHaveCount(0);
    const first = page.getByRole('article').first();
    await expect(first).toHaveAccessibleName('Rank 1: Dockside Promenade 5K');
    await expect(first.getByText('PB Score', { exact: true })).toBeVisible();
    await expect(first.getByText(/^0\.9\d{2} \(historically faster vs analysed cohort\)$/)).toBeVisible();
    await first.getByRole('button', { name: 'Why this?' }).click();
    await expect(first.getByText('High PB Score (100/100)')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await first.getByRole('link', { name: 'View event' }).click();
    await expect(page).toHaveURL(/\/event\/demo-dockside-promenade-5k$/);
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

test.describe('Core analytics (Phase 3A)', () => {
  test('Event page explains Competition V1 and Difficulty V1', async ({ page }) => {
    await page.goto('/event/demo-victoria-park-5k');
    const metrics = page.getByRole('region', { name: 'Key metrics' });
    await expect(metrics.getByText('4.9')).toBeVisible(); // Difficulty V1
    await expect(page.getByText(/Course speed course_speed_v1 · Competition competition_v1 · Difficulty difficulty_v1 · PB Score pb_v1/)).toBeVisible();

    const explainer = page.getByRole('region', { name: 'How the scores are calculated' });
    const toggle = explainer.getByRole('button', { name: /How it's calculated/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['Winner strength', 'Podium depth', 'Top-5 depth', 'Top-10 depth', 'Field depth']) {
      await expect(explainer.getByText(new RegExp(`^${label} · \\d+%$`))).toBeVisible();
    }
    await expect(explainer.getByText(/compared with 10 analysed events/)).toBeVisible();
    for (const [label, weight] of [['Elevation', 55], ['Surface', 25], ['Course structure', 20]] as const) {
      await expect(explainer.getByText(`${label} · ${weight}%`)).toBeVisible();
    }
    await expect(explainer.getByText('54 m')).toBeVisible();
    await expect(explainer.getByText(/not an official or universal parkrun rating/)).toBeVisible();
    await expect(explainer.getByText(/not the chance of any result/).first()).toBeVisible();

    await explainer.getByRole('radiogroup', { name: 'Competition period' }).getByRole('radio', { name: '30d' }).click();
    await expect(explainer.getByText(/Based on [1-5] usable events/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

});

test.describe('Course Speed & PB Score V1 (Phase 3B)', () => {
  test('PB Score V1 replaces the demo PB label across tools', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Your best pick' }).getByText('PB opportunity', { exact: true })).toBeVisible();
    await expect(page.getByText(/Demo PB/)).toHaveCount(0);
    await page.goto('/saturday');
    await expect(page.getByRole('article').first().getByText('PB opportunity', { exact: true })).toBeVisible();
    await page.goto('/compare?ids=demo-riverside-5k,demo-lakeside-5k');
    await expect(page.getByRole('rowheader', { name: 'PB Score' })).toBeVisible();
    await expect(page.getByText(/Demo PB|PB Scores are demo/)).toHaveCount(0);
    await expect(page.getByText(/Competition \(competition_v1\) is relative/)).toBeVisible();
  });

  test('Event page explains the Course Speed Factor and the PB Score breakdown', async ({ page }) => {
    await page.goto('/event/demo-forest-trail-5k');
    const explainer = page.getByRole('region', { name: 'How the scores are calculated' });
    await explainer.getByRole('button', { name: /How it's calculated/ }).click();
    await expect(explainer.getByRole('heading', { name: 'Course Speed Factor' })).toBeVisible();
    await expect(explainer.getByText(/^1\.0\d{2}$/)).toBeVisible();
    for (const label of ['Matched runners', 'One-to-one comparisons', 'Typical gap between runs', 'Typical disagreement with the model', 'Stability (runner bootstrap)']) {
      await expect(explainer.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(explainer.getByText(/not\s+any runner's finish time/)).toBeVisible();
    await expect(explainer.getByText(/geometric mean of the eligible analysed cohort is 1\.000/).first()).toBeVisible();
    await expect(explainer.getByText(/a cohort reference, not a neutral 5K course/).first()).toBeVisible();
    await expect(explainer.getByRole('heading', { name: 'PB Score' })).toBeVisible();
    await expect(explainer.getByText('Observed course speed · 75%')).toBeVisible();
    await expect(explainer.getByText('Structural suitability · 25%')).toBeVisible();
    await expect(explainer.getByText(/Competition is not part of PB Score/)).toBeVisible();
    await expect(explainer.getByText(/90% (confidence|prediction) interval/i)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('Where Could I Place? defaults to course adjusted for a time with a known source event', async ({ page }) => {
    await page.goto('/where-could-i-place?src=recent&travel=90&window=all');
    await expect(page.getByRole('radio', { name: 'Recent best 19:32' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Achieved at')).toHaveValue('demo-riverside-5k');
    const modes = page.getByRole('radiogroup', { name: 'Compare as' });
    await expect(modes.getByRole('radio', { name: 'Course adjusted' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/at Riverside 5K, converted to each course/)).toBeVisible();

    const forest = page.getByRole('article', { name: 'Forest Trail 5K' });
    await expect(forest.getByText('Equivalent here')).toBeVisible();
    await expect(forest.getByText(/^≈ \d{2}:\d{2}$/)).toBeVisible();
    await expect(forest.getByText(/^Course adjustment \+\d:\d{2}$/)).toBeVisible();
    await expect(forest.getByText('Achieved at Riverside 5K')).toBeVisible();
    await expect(forest.getByText('Adjustment confidence')).toBeVisible();
    for (const label of ['1st historically', 'Top 3 historically', 'Top 10 historically']) await expect(forest.getByText(label)).toBeVisible();
    const adjustedPosition = await forest.getByText('Typical position').locator('xpath=following-sibling::dd').textContent();

    await modes.getByRole('radio', { name: 'Raw time' }).click();
    await expect(page).toHaveURL(/mode=raw/);
    await expect(page.getByText(/exact same time is compared/)).toBeVisible();
    await expect(forest.getByText('Equivalent here')).toHaveCount(0);
    await expect(page.getByText(/Historically, 19:32 would have placed like this at/)).toBeVisible();
    // Raw time flatters the slower course: it places differently from the adjusted equivalent.
    await expect(forest.getByText('Typical position').locator('xpath=following-sibling::dd')).not.toHaveText(adjustedPosition!);
    await expectNoHorizontalScroll(page);
  });

  test('Course adjusted with event-less current form asks for a source event instead of showing raw results', async ({ page }) => {
    await page.goto('/where-could-i-place?src=current');
    const modes = page.getByRole('radiogroup', { name: 'Compare as' });
    await expect(page.getByText('Raw time comparison — course adjustment unavailable', { exact: true })).toBeVisible();
    await modes.getByRole('radio', { name: 'Course adjusted' }).click();
    await expect(page).toHaveURL(/mode=adjusted/);
    await expect(modes.getByRole('radio', { name: 'Course adjusted' })).toHaveAttribute('aria-checked', 'true');
    const prompt = page.getByRole('note', { name: 'Course adjustment needs a source event' });
    await expect(prompt.getByText(/Current form is an estimate of your fitness/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose where this time was achieved' })).toBeVisible();
    // No raw-time results while the UI is in Course adjusted mode.
    await expect(page.getByRole('article')).toHaveCount(0);

    await prompt.getByRole('button', { name: 'Use Recent best 19:32 (Riverside 5K)' }).click();
    await expect(page.getByRole('radio', { name: 'Recent best 19:32' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/at Riverside 5K, converted to each course/)).toBeVisible();
    await expect(page.getByRole('article').first().getByText('Equivalent here')).toBeVisible();
  });

  test('Where Could I Place? lets the runner say where a typed time was achieved', async ({ page }) => {
    await page.goto('/where-could-i-place?src=manual&time=1260');
    const modes = page.getByRole('radiogroup', { name: 'Compare as' });
    // Auto mode with no source event: raw time, explicitly labelled as a fallback.
    await expect(modes.getByRole('radio', { name: 'Raw time' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Raw time comparison — course adjustment unavailable', { exact: true })).toBeVisible();
    await expect(page.getByText('Course adjustment requires a source event: choose where this time was achieved.').first()).toBeVisible();

    await page.getByLabel('Achieved at').selectOption('demo-moorland-edge-5k');
    await expect(page).toHaveURL(/from=demo-moorland-edge-5k/);
    await expect(modes.getByRole('radio', { name: 'Course adjusted' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Historically, 21:00 at Moorland Edge 5K, converted to each course/)).toBeVisible();
    await expect(page.getByText('Raw time comparison — course adjustment unavailable', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Course adjustment −\d:\d{2}$/).first()).toBeVisible();

    await page.getByRole('link', { name: 'Compare events' }).click();
    await expect(page).toHaveURL(/\/compare\?ids=.+&time=1260&from=demo-moorland-edge-5k/);
    await expect(page.getByRole('rowheader', { name: 'Equivalent here' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Course Speed Factor' })).toBeVisible();
  });
});

test.describe('Personal performance history (Phase 4A)', () => {
  /**
   * Tests that change data use old dates unique to each viewport and test, slow times and an
   * event the demo user already runs, then clean up, so parallel tests never see their PBs,
   * recent best, latest run or visited events move.
   */
  const YEAR: Record<string, number> = { 'mobile-360': 2019, 'mobile-390': 2020, 'mobile-430': 2021 };
  const isoFor = (project: string, month: number) => `${YEAR[project] ?? 2018}-${String(month).padStart(2, '0')}-07`;
  const longDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const create = async (page: Page, date: string, time: string) => {
    const res = await page.request.post('/api/profile/performances', { data: { eventId: 'demo-riverside-5k', date, time } });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: string };
  };
  const cleanUp = async (page: Page, date: string) => {
    const list = (await (await page.request.get('/api/profile/performances?eventId=demo-riverside-5k')).json()) as { performances: { id: string; date: string }[] };
    for (const p of list.performances.filter((x) => x.date === date)) await page.request.delete(`/api/profile/performances/${p.id}`);
  };

  test('Profile shows a performance summary, recent performances and the parkrun placeholder', async ({ page }) => {
    await page.goto('/profile');
    const summary = page.getByRole('region', { name: 'Performance summary' });
    await expect(summary.getByRole('link', { name: /^Overall 5K PB 18:58 at Riverside 5K/ })).toBeVisible();
    await expect(summary.getByRole('link', { name: /^Recent best 19:32 at Riverside 5K/ })).toBeVisible();
    await expect(summary.getByText('Last run')).toBeVisible();
    await expect(summary.getByText('Different events')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current form' }).getByText(/estimate of your fitness \(demo value\), not a recorded performance/)).toBeVisible();

    const recent = page.getByRole('list', { name: 'Recent performances' });
    await expect(recent.getByRole('listitem')).toHaveCount(8);
    await expect(recent.getByRole('listitem').first()).toContainText(/^.+ 5K · \d{2}:\d{2}\d{1,2} \w{3,4} \d{4} · Manual/);

    const parkrun = page.getByRole('region', { name: 'Connect your parkrun history' });
    await expect(parkrun.getByText('Coming later')).toBeVisible();
    await expect(parkrun.getByText('Automatic history import will require a supported data connection.')).toBeVisible();
    await expect(parkrun.getByLabel('parkrun ID')).toBeDisabled();
    await expect(parkrun.getByLabel('parkrun ID')).toHaveAttribute('placeholder', 'A1234567');
    await expectNoHorizontalScroll(page);
  });

  test('Profile → Add performance → performance appears', async ({ page }, info) => {
    const date = isoFor(info.project.name, 1);
    await cleanUp(page, date);
    await page.goto('/profile');
    await page.getByRole('link', { name: 'Add performance' }).first().click();
    await expect(page).toHaveURL(/\/profile\/performances\/new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Add performance' })).toBeVisible();
    const form = page.getByRole('form', { name: 'Add performance' });

    // Client and server validation are both readable.
    await form.getByRole('button', { name: 'Add performance' }).click();
    await expect(form.getByText('Choose an event.')).toBeVisible();
    await form.getByLabel('Event').selectOption('demo-riverside-5k');
    await form.getByLabel('Date').fill(date);
    await form.getByLabel('Finish time').fill('19:75');
    await form.getByRole('button', { name: 'Add performance' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a finish time like 19:35 or 1:05:30.');
    await expect(form.getByLabel('Finish time')).toHaveAttribute('aria-invalid', 'true');
    await expectNoHorizontalScroll(page);

    await form.getByLabel('Finish time').fill('24:31');
    await form.getByRole('button', { name: 'Add performance' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole('link', { name: /^See all \d+ performances/ }).click();
    const row = page.getByRole('list', { name: 'All performances' }).getByRole('listitem').filter({ hasText: longDate(date) });
    await expect(row).toContainText('Riverside 5K · 24:31');
    await expect(row).toContainText('Manual');

    // The same event on the same date again is a duplicate.
    await page.goto('/profile/performances/new?event=demo-riverside-5k');
    await page.getByLabel('Date').fill(date);
    await page.getByLabel('Finish time').fill('25:00');
    await page.getByRole('button', { name: 'Add performance' }).click();
    await expect(page.getByText(/You already have a performance at Riverside 5K on .+\. Edit that one instead\./)).toBeVisible();
    await cleanUp(page, date);
  });

  test('Edit performance', async ({ page }, info) => {
    const date = isoFor(info.project.name, 2);
    const newDate = isoFor(info.project.name, 3);
    await cleanUp(page, date);
    await cleanUp(page, newDate);
    await create(page, date, '24:40');
    await page.goto('/profile/performances');
    await page.getByRole('link', { name: `Edit Riverside 5K, ${longDate(date)}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit performance' })).toBeVisible();
    const form = page.getByRole('form', { name: 'Edit performance' });
    await expect(form.getByLabel('Event')).toHaveValue('demo-riverside-5k');
    await expect(form.getByLabel('Date')).toHaveValue(date);
    await expect(form.getByLabel('Finish time')).toHaveValue('24:40');
    await expectNoHorizontalScroll(page);

    await form.getByLabel('Date').fill(newDate);
    await form.getByLabel('Finish time').fill('24:45');
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.goto('/profile/performances');
    const list = page.getByRole('list', { name: 'All performances' });
    await expect(list.getByRole('listitem').filter({ hasText: longDate(newDate) })).toContainText('Riverside 5K · 24:45');
    await expect(list.getByRole('listitem').filter({ hasText: longDate(date) })).toHaveCount(0);
    await cleanUp(page, newDate);
  });

  test('Delete performance (with confirmation)', async ({ page }, info) => {
    const date = isoFor(info.project.name, 4);
    await cleanUp(page, date);
    const { id } = await create(page, date, '24:50');
    await page.goto(`/profile/performances/${id}/edit`);
    await page.getByRole('button', { name: 'Delete performance' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete this performance?' });
    await expect(confirm).toContainText(`Riverside 5K · 24:50 · ${longDate(date)}`);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect((await page.request.get(`/api/profile/performances/${id}`)).status()).toBe(200);

    await page.getByRole('button', { name: 'Delete performance' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this performance?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    expect((await page.request.get(`/api/profile/performances/${id}`)).status()).toBe(404);
    await page.goto('/profile/performances');
    await expect(page.getByRole('list', { name: 'All performances' }).getByRole('listitem').filter({ hasText: longDate(date) })).toHaveCount(0);
  });

  test('Profile → performance → Event, with "Your history here"', async ({ page }) => {
    await page.goto('/profile/performances');
    await page.getByRole('list', { name: 'All performances' }).getByRole('link', { name: /^Lakeside 5K · / }).first().click();
    await expect(page).toHaveURL(/\/event\/demo-lakeside-5k$/);
    const history = page.getByRole('region', { name: 'Your history here' });
    await expect(history).toContainText('2 runs');
    await expect(history).toContainText('PB19:09');
    await expect(history.getByRole('list', { name: 'Your recent runs here' }).getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('link', { name: 'Add a run' })).toHaveAttribute('href', '/profile/performances/new?event=demo-lakeside-5k');
    await expectNoHorizontalScroll(page);

    await page.goto('/event/demo-moorland-edge-5k');
    await expect(page.getByRole('region', { name: 'Your history here' })).toContainText("You haven't recorded a run here yet.");
  });

  test('Profile → Overall 5K PB → Where Could I Place?, course adjusted from its own event', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('link', { name: /^Overall 5K PB 18:58 at Riverside 5K/ }).click();
    await expect(page).toHaveURL(/\/where-could-i-place\?src=pb$/);
    await expect(page.getByRole('radio', { name: 'Overall 5K PB 18:58' })).toHaveAttribute('aria-checked', 'true');
    // The source event comes from the matching performance: no manual "Achieved at" needed.
    await expect(page.getByLabel('Achieved at')).toHaveValue('demo-riverside-5k');
    await expect(page.getByRole('radiogroup', { name: 'Compare as' }).getByRole('radio', { name: 'Course adjusted' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Historically, 18:58 at Riverside 5K, converted to each course/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('Add another 5K race by name: it is listed, counts as a performance, and has no event page', async ({ page }, info) => {
    const date = isoFor(info.project.name, 5);
    const name = `Test Harriers 5K ${info.project.name}`;
    const cleanUpExternal = async () => {
      const all = (await (await page.request.get('/api/profile/performances')).json()) as { performances: { id: string; eventName: string }[] };
      for (const p of all.performances.filter((x) => x.eventName === name)) await page.request.delete(`/api/profile/performances/${p.id}`);
    };
    await cleanUpExternal();
    await page.goto('/profile/performances/new');
    const form = page.getByRole('form', { name: 'Add performance' });
    await form.getByRole('radiogroup', { name: 'Performance type' }).getByRole('radio', { name: 'Other 5K race' }).click();
    await expect(form.getByLabel('Event')).toHaveCount(0);
    await form.getByLabel('Race name').fill(name);
    await form.getByLabel('Date').fill(date);
    await form.getByLabel('Finish time').fill('24:55');
    await expect(form.getByText(/count towards your 5K PB but cannot be course-adjusted/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await form.getByRole('button', { name: 'Add performance' }).click();
    await expect(page).toHaveURL(/\/profile$/);

    await page.goto('/profile/performances');
    const row = page.getByRole('list', { name: 'All performances' }).getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText(`${name} · 24:55`);
    await expect(row).toContainText('Other 5K race · Manual');
    // Only the edit link: no event page exists for a course 5K Compass does not model.
    await expect(row.getByRole('link')).toHaveCount(1);
    await expect(row.getByRole('link')).toHaveAccessibleName(`Edit ${name}, ${longDate(date)}`);
    await cleanUpExternal();
  });

  test('An external-race Overall 5K PB works in Raw time and never silently becomes course adjusted', async ({ page }) => {
    // Pretend the fastest 5K was an external road race (mocked profile; shared data untouched).
    await page.route('**/api/profile', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const external = { ...body.performance.lifetimePb, id: 'ext-pb', eventId: null, eventName: 'Warrington 5K', externalEventName: 'Warrington 5K', courseModelled: false, performanceType: 'road_race', finishTimeSeconds: 1120 };
      body.performance.lifetimePb = external;
      body.lifetimePbSeconds = 1120;
      body.lifetimePbEvent = null;
      await route.fulfill({ response: res, json: body });
    });
    await page.goto('/where-could-i-place?src=pb&travel=90');
    await expect(page.getByRole('radio', { name: 'Overall 5K PB 18:40' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Achieved at')).toBeDisabled();
    await expect(page.getByLabel('Achieved at')).toContainText('Warrington 5K (not modelled by 5K Compass)');
    const modes = page.getByRole('radiogroup', { name: 'Compare as' });
    await expect(modes.getByRole('radio', { name: 'Raw time' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Raw time comparison — course adjustment unavailable', { exact: true })).toBeVisible();
    const notModelled = 'Course adjustment unavailable — this performance was recorded at a course not currently modelled by 5K Compass.';
    await expect(page.getByText(notModelled).first()).toBeVisible();
    // Raw time works: placements for 18:40 unchanged at every event.
    await expect(page.getByText(/Historically, 18:40 would have placed like this at/)).toBeVisible();
    await expect(page.getByRole('article').first().getByText('Equivalent here')).toHaveCount(0);

    await modes.getByRole('radio', { name: 'Course adjusted' }).click();
    const prompt = page.getByRole('note', { name: 'Course adjustment needs a source event' });
    await expect(prompt.getByText('Course adjustment unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await prompt.getByRole('button', { name: 'Compare as raw time' }).click();
    await expect(modes.getByRole('radio', { name: 'Raw time' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('article').first()).toBeVisible();
  });
});

