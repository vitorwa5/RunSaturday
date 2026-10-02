/**
 * Seeds the DEMO dataset (fictional events, NOT real parkrun statistics).
 *
 * Idempotent: removes previous DEMO rows (and the demo user) before inserting, and never
 * touches rows with source = IMPORTED. Then recalculates analytics snapshots.
 *
 *   npm run db:seed
 */
import { calendarDateIn } from '@runsaturday/shared';
import { recalculateAnalytics } from '../src/analytics/recalculate';
import { PrismaDataStore } from '../src/repositories/prisma/PrismaDataStore';
import { recalculateRunnerForm } from '../src/services/runnerForm';
import { createPrismaClient } from '../src/db/prisma';
import { summarizeResults } from '../src/domain/occurrenceSummary';
import { buildDemoDataset, DEMO_WINDOW_DAYS } from '../src/demo/buildDemoDataset';
import { demoUserPerformances } from '../src/demo/demoUserPerformances';
import { performanceDuplicateKey } from '../src/domain/performanceKey';

const RESULT_BATCH_SIZE = 5000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');

  const db = createPrismaClient(databaseUrl);
  const today = calendarDateIn(new Date(), process.env.APP_TIME_ZONE ?? 'Europe/London');
  const dataset = buildDemoDataset(today);

  try {
    // The demo user first: its performances reference demo events (events are delete-restricted
    // so that removing an event can never silently delete someone's history).
    await db.user.deleteMany({ where: { isDemo: true } });
    const removed = await db.event.deleteMany({ where: { source: 'DEMO' } });
    console.log(`Removed ${removed.count} previous DEMO events.`);

    let resultCount = 0;
    for (const { id, def, occurrences, sampleSize, averageParticipants } of dataset.events) {
      await db.event.create({
        data: {
          id,
          slug: def.slug,
          name: def.name,
          country: 'England',
          region: 'North West England',
          town: def.town,
          latitude: def.latitude,
          longitude: def.longitude,
          startLocationText: def.startLocationText,
          startTime: '09:00',
          courseType: def.courseType,
          surface: def.surface,
          laps: def.laps,
          elevationM: def.elevationM,
          ...def.facilities,
          source: 'DEMO',
          scores: {
            create: {
              ...def.scores,
              components: { note: 'DEMO legacy snapshot: average participants and Gem base score only. PB Score comes from pb_v1.' },
              averageParticipants,
              sampleSize,
              windowDays: DEMO_WINDOW_DAYS,
              asOfDate: toDate(dataset.latestDate),
              calculationVersion: dataset.scoreVersion,
            },
          },
        },
      });

      for (const o of occurrences) {
        // Results are canonical; the occurrence summary columns are derived from them.
        const occurrence = await db.eventOccurrence.create({
          data: {
            eventId: id,
            date: toDate(o.date),
            ...summarizeResults(o.results),
            status: o.status,
            dataQuality: o.status === 'COMPLETED' ? 'VALID' : 'UNVALIDATED',
          },
        });
        for (let i = 0; i < o.results.length; i += RESULT_BATCH_SIZE) {
          const batch = o.results.slice(i, i + RESULT_BATCH_SIZE);
          await db.result.createMany({
            data: batch.map((r) => ({ occurrenceId: occurrence.id, ...r })),
          });
          resultCount += batch.length;
        }
      }
    }

    // Demo user: settings and favourites only. Lifetime PB, recent best and visits are derived
    // from UserPerformance (the transitional User/UserEvent columns are left empty).
    const { favouriteEventIds, ...user } = dataset.user;
    await db.user.create({
      data: {
        ...user,
        isDemo: true,
        events: { create: favouriteEventIds.map((eventId) => ({ eventId, favourite: true })) },
      },
    });
    const performances = demoUserPerformances(dataset.latestDate);
    await db.userPerformance.createMany({
      data: performances.map((p) => ({
        ...p,
        date: toDate(p.date),
        performanceType: 'PARKRUN' as const,
        source: 'MANUAL' as const,
        duplicateKey: performanceDuplicateKey(p),
      })),
    });

    // Derived analytics (Course Speed V1, Difficulty V1, Competition V1, PB Score V1) so a fresh database is complete.
    const analytics = await recalculateAnalytics(db, today);
    console.log(
      `Calculated analytics as of ${analytics.asOfDate}: ${analytics.courseFactorSnapshots} course factors (${analytics.fittedFactors} fitted), ` +
        `${analytics.competitionSnapshots + analytics.difficultySnapshots + analytics.pbSnapshots} score snapshots.`,
    );

    // Current Form (runner_form_v1) from the demo user's performances and the new course factors.
    const form = await recalculateRunnerForm(new PrismaDataStore(db, dataset.scoreVersion), user.id, today);
    console.log(`Current Form: ${form.status}${form.formSeconds != null ? ` ${form.formSeconds}s (${form.confidence.level})` : ''}.`);

    const occurrenceCount = dataset.events.reduce((n, e) => n + e.occurrences.length, 0);
    console.log(
      `Seeded DEMO data: ${dataset.events.length} events, ${occurrenceCount} occurrences, ` +
        `${resultCount} results (latest ${dataset.latestDate}), 1 demo user with ${performances.length} performances.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
