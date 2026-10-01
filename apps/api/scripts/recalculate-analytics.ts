/**
 * npm run analytics:recalculate [-- --as-of=YYYY-MM-DD]
 * Recalculates Competition V1 and Difficulty V1 snapshots. Defaults to today (APP_TIME_ZONE).
 */
import { calendarDateIn } from '@runsaturday/shared';
import { recalculateAnalytics } from '../src/analytics/recalculate';
import { createPrismaClient } from '../src/db/prisma';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  const arg = process.argv.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length);
  if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error('--as-of must be YYYY-MM-DD');
  const asOfDate = arg ?? calendarDateIn(new Date(), process.env.APP_TIME_ZONE ?? 'Europe/London');

  const db = createPrismaClient(url);
  try {
    const started = Date.now();
    const summary = await recalculateAnalytics(db, asOfDate);
    console.log(
      `Analytics recalculated as of ${summary.asOfDate}: ${summary.events} events, ` +
        `${summary.competitionSnapshots} competition_v1 and ${summary.difficultySnapshots} difficulty_v1 snapshots ` +
        `(${Date.now() - started} ms).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('Analytics recalculation failed:', error);
  process.exit(1);
});
