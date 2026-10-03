/**
 * CANONICAL full analytics refresh, in dependency order:
 *
 *   1. event analytics (recalculateAnalytics):
 *        Course Speed Factors → Difficulty → Competition → PB Score → event snapshots
 *   2. Runner Form (runner_form_v1) for every user, from the Course Speed Factors written in step 1
 *
 * Runner Form depends on the factors, so it always runs after them: a factor refresh can never
 * leave Current Form silently based on the previous factors. Runner Form never triggers event
 * analytics, so there is no cycle. Used by `npm run analytics:recalculate` and the seed;
 * `npm run runner-form:recalculate` stays available for step 2 alone (debugging/manual use).
 * Performance create/edit/delete recalculates only that user's Runner Form.
 */
import type { RunnerFormStatus } from '@runsaturday/shared';
import type { Db } from '../db/prisma';
import type { CatalogueMode } from '../catalogue/policy';
import type { DataStore } from '../repositories/DataStore';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';
import { recalculateRunnerForm } from '../services/runnerForm';
import { recalculateAnalytics, type RecalculationSummary } from './recalculate';

export type RunnerFormSummary = { users: number } & Record<RunnerFormStatus, number>;

/** Step 2: every given user's Current Form, recalculated from the store's current factors. */
export async function recalculateAllRunnerForms(store: DataStore, userIds: readonly string[], asOfDate: string): Promise<RunnerFormSummary> {
  const summary: RunnerFormSummary = { users: userIds.length, estimate: 0, indicative: 0, unavailable: 0 };
  for (const id of userIds) summary[(await recalculateRunnerForm(store, id, asOfDate)).status]++;
  return summary;
}

/** Steps 1 then 2, with the dependencies injected (pure orchestration; tested without a database). */
export async function refreshAll<T>(deps: {
  recalculateEventAnalytics: () => Promise<T>;
  store: DataStore;
  listUserIds: () => Promise<string[]>;
  asOfDate: string;
}): Promise<{ events: T; runnerForms: RunnerFormSummary }> {
  const events = await deps.recalculateEventAnalytics();
  const runnerForms = await recalculateAllRunnerForms(deps.store, await deps.listUserIds(), deps.asOfDate);
  return { events, runnerForms };
}

/** The canonical refresh against PostgreSQL. */
export async function refreshAllAnalytics(db: Db, asOfDate: string, mode: CatalogueMode = 'beta'): Promise<{ events: RecalculationSummary; runnerForms: RunnerFormSummary }> {
  return refreshAll({
    recalculateEventAnalytics: () => recalculateAnalytics(db, asOfDate, mode),
    store: new PrismaDataStore(db, 'demo_v0', mode),
    listUserIds: async () => (await db.user.findMany({ where: { isDemo: mode === 'demo' }, select: { id: true }, orderBy: { id: 'asc' } })).map((u) => u.id),
    asOfDate,
  });
}
