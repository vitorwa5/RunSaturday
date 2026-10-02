/**
 * npm run runner-form:recalculate [-- --as-of=YYYY-MM-DD]
 * Recalculates Current Form (runner_form_v1) snapshots for every user from their performances and
 * the latest Course Speed Factors. Run it after `analytics:recalculate` so new factors are used;
 * the seed runs both. Deterministic for a given date. Defaults to today (APP_TIME_ZONE).
 */
import { calendarDateIn } from '@runsaturday/shared';
import { createPrismaClient } from '../src/db/prisma';
import { PrismaDataStore } from '../src/repositories/prisma/PrismaDataStore';
import { recalculateRunnerForm } from '../src/services/runnerForm';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  const arg = process.argv.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length);
  if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error('--as-of must be YYYY-MM-DD');
  const asOfDate = arg ?? calendarDateIn(new Date(), process.env.APP_TIME_ZONE ?? 'Europe/London');

  const db = createPrismaClient(url);
  try {
    const store = new PrismaDataStore(db, 'demo_v0');
    const users = await db.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    const counts = { estimate: 0, indicative: 0, unavailable: 0 };
    for (const { id } of users) counts[(await recalculateRunnerForm(store, id, asOfDate)).status]++;
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
