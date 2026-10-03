/**
 * npm run analytics:recalculate [-- --as-of=YYYY-MM-DD]
 * The canonical full analytics refresh (analytics/refreshAll.ts): Course Speed Factors → Difficulty
 * → Competition → PB Score, then every user's Runner Form. Defaults to today (APP_TIME_ZONE).
 */
import { calendarDateIn } from '@runsaturday/shared';
import { catalogueMode } from '../src/catalogue/policy';
import { refreshAllAnalytics } from '../src/analytics/refreshAll';
import { createPrismaClient } from '../src/db/prisma';

async function main() {
  const mode = catalogueMode(process.env);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  const arg = process.argv.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length);
  if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error('--as-of must be YYYY-MM-DD');
  const asOfDate = arg ?? calendarDateIn(new Date(), process.env.APP_TIME_ZONE ?? 'Europe/London');

  const db = createPrismaClient(url);
  try {
    const started = Date.now();
    const { events: summary, runnerForms } = await refreshAllAnalytics(db, asOfDate, mode);
    console.log(
      `Analytics recalculated as of ${summary.asOfDate}: ${summary.events} events, ` +
        `${summary.courseFactorSnapshots} course_speed_v1 (${summary.fittedFactors} fitted), ` +
        `${summary.difficultySnapshots} difficulty_v1, ${summary.competitionSnapshots} competition_v1 and ${summary.pbSnapshots} pb_v1 snapshots ` +
        `then Runner Form for ${runnerForms.users} users (${runnerForms.estimate} estimates, ${runnerForms.indicative} indicative, ${runnerForms.unavailable} unavailable) ` +
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
