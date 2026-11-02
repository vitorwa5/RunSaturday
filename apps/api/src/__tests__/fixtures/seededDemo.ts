import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { buildDemoDataset, DEMO_WINDOW_DAYS } from '../../demo/buildDemoDataset';
import { demoUserPerformances } from '../../demo/demoUserPerformances';
import { summarizeResults } from '../../domain/occurrenceSummary';
import { performanceDuplicateKey } from '../../domain/performanceKey';
import { refreshAllAnalytics } from '../../analytics/refreshAll';

/** Own one schema inside TEST_DATABASE_URL; public data is never read, reset or seeded. */
export function seededDemoFixture(databaseUrl: string, today: string) {
  const schema = `parity_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, options: `-c search_path=${schema}` }, { schema }) });
  const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return {
    db,
    async setup() {
      const client = await pool.connect();
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        const migrations = (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort();
        for (const migration of migrations) {
          await client.query('BEGIN');
          try {
            await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
            await client.query('COMMIT');
          } catch (error) { await client.query('ROLLBACK'); throw error; }
        }
      } finally { client.release(); }

      const dataset = buildDemoDataset(today);
      for (const { id, def, occurrences, sampleSize, averageParticipants } of dataset.events) {
        await db.event.create({ data: {
          id, slug: def.slug, name: def.name, country: 'England', region: 'North West England', town: def.town,
          latitude: def.latitude, longitude: def.longitude, startLocationText: def.startLocationText, startTime: '09:00',
          courseType: def.courseType, surface: def.surface, laps: def.laps, elevationM: def.elevationM, ...def.facilities, source: 'DEMO',
          scores: { create: { ...def.scores, components: { note: 'DEMO legacy snapshot: average participants and Gem base score only. PB Score comes from pb_v1.' }, averageParticipants, sampleSize, windowDays: DEMO_WINDOW_DAYS, asOfDate: toDate(dataset.latestDate), calculationVersion: dataset.scoreVersion } },
        } });
        for (const occurrence of occurrences) {
          const row = await db.eventOccurrence.create({ data: {
            eventId: id, date: toDate(occurrence.date), ...summarizeResults(occurrence.results), status: occurrence.status,
            dataQuality: occurrence.status === 'COMPLETED' ? 'VALID' : 'UNVALIDATED',
          } });
          for (let offset = 0; offset < occurrence.results.length; offset += 5000) {
            await db.result.createMany({ data: occurrence.results.slice(offset, offset + 5000).map(result => ({ occurrenceId: row.id, ...result })) });
          }
        }
      }
      const { favouriteEventIds, ...user } = dataset.user;
      await db.user.create({ data: { ...user, isDemo: true, onboardingCompletedAt: new Date('2026-10-01T00:00:00.000Z'), events: { create: favouriteEventIds.map(eventId => ({ eventId, favourite: true })) } } });
      await db.userPerformance.createMany({ data: demoUserPerformances(dataset.latestDate).map(performance => ({
        ...performance, date: toDate(performance.date), performanceType: 'PARKRUN', source: 'MANUAL', duplicateKey: performanceDuplicateKey(performance),
      })) });
      await refreshAllAnalytics(db, today, 'demo');
    },
    async cleanup() {
      await db.$disconnect();
      try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await pool.end(); }
    },
  };
}
