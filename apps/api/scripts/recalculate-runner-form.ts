/**
 * npm run runner-form:recalculate [-- --as-of=YYYY-MM-DD]
 * Recalculates Current Form (runner_form_v1) snapshots for every user from their performances and
 * the latest Course Speed Factors (step 2 of the canonical refresh only). `analytics:recalculate`
 * already runs it after refreshing the factors; use this for debugging or manual reruns.
 * Deterministic for a given date. Defaults to today (APP_TIME_ZONE).
 */
import { calendarDateIn } from '@runsaturday/shared';
import { catalogueMode } from '../src/catalogue/policy';
import { createPrismaClient } from '../src/db/prisma';
import { PrismaDataStore } from '../src/repositories/prisma/PrismaDataStore';
import { recalculateAllRunnerForms } from '../src/analytics/refreshAll';

async function main() {
  const mode = catalogueMode(process.env);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  const arg = process.argv.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length);
  if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error('--as-of must be YYYY-MM-DD');
  const asOfDate = arg ?? calendarDateIn(new Date(), process.env.APP_TIME_ZONE ?? 'Europe/London');

  const db = createPrismaClient(url);
  try {
    const store = new PrismaDataStore(db, 'demo_v0', mode);
    const users = await db.user.findMany({ where: { isDemo: mode === 'demo' }, select: { id: true }, orderBy: { id: 'asc' } });
    const counts = await recalculateAllRunnerForms(store, users.map((u) => u.id), asOfDate);
    console.log(
      `Runner Form recalculated as of ${asOfDate} for ${users.length} users: ` +
        `${counts.estimate} estimates, ${counts.indicative} indicative, ${counts.unavailable} unavailable.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('Runner Form recalculation failed:', error);
  process.exit(1);
});
