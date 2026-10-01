/**
 * Integration test against a real, seeded PostgreSQL database. Skipped unless
 * TEST_DATABASE_URL is set, e.g.:
 *
 *   TEST_DATABASE_URL=postgresql://runsaturday:runsaturday@localhost:5432/runsaturday npm test -w @runsaturday/api
 */
import { calendarDateIn } from '@runsaturday/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../db/prisma';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PrismaDataStore (seeded database)', () => {
  const today = calendarDateIn(new Date(), 'Europe/London');
  const db = url ? createPrismaClient(url) : null;
  const store = db ? new PrismaDataStore(db, 'demo_v0') : null;
  const memory = new MemoryDataStore(today);
  afterAll(async () => db?.$disconnect());

  it('is reachable', async () => {
    expect(await store!.ping()).toBe(true);
  });

  it('returns the same DEMO events and scores as the in-memory store', async () => {
    const strip = (events: Awaited<ReturnType<MemoryDataStore['listActiveEvents']>>) =>
      events
        .filter((e) => e.source === 'demo')
        .map(({ scores, ...e }) => ({ ...e, pbScore: scores?.pbScore, sampleSize: scores?.sampleSize }));
    expect(strip(await store!.listActiveEvents())).toEqual(strip(await memory.listActiveEvents()));
  });

  it('matches event detail occurrences and facilities', async () => {
    const [fromDb, fromMemory] = await Promise.all([
      store!.getEvent('demo-estuary-path-5k', today),
      memory.getEvent('demo-estuary-path-5k', today),
    ]);
    expect(fromDb?.facilities).toEqual(fromMemory?.facilities);
    expect(fromDb?.recentOccurrences).toEqual(fromMemory?.recentOccurrences);
    expect(fromDb?.occurrencesLast90Days).toBe(fromMemory?.occurrencesLast90Days);
  });

  it('lists the same occurrences as the in-memory store', async () => {
    expect(await store!.findEventId('demo-heath-common-5k')).toBe('demo-heath-common-5k');
    expect(await store!.findEventId('nope')).toBeNull();
    expect(await store!.listOccurrences('demo-heath-common-5k')).toEqual(await memory.listOccurrences('demo-heath-common-5k'));
  });

  it('searches case-insensitively in SQL', async () => {
    expect((await store!.searchEvents('wIgAn', 10)).map((e) => e.name)).toEqual(['Canal Towpath 5K']);
  });

  it('keeps the occurrence summary cache consistent with canonical Result rows', async () => {
    // Every cached column must equal what the Result rows say; any row returned is a conflict.
    const conflicts = await db!.$queryRaw<{ id: string }[]>`
      SELECT o.id
      FROM "EventOccurrence" o
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n,
               MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 1)  AS p1,
               MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 3)  AS p3,
               MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 5)  AS p5,
               MAX(r."finishTimeSeconds") FILTER (WHERE r.position = 10) AS p10
        FROM "Result" r WHERE r."occurrenceId" = o.id
      ) agg ON true
      WHERE o."participantCount" IS DISTINCT FROM NULLIF(agg.n, 0)
         OR o."winnerTimeSeconds" IS DISTINCT FROM agg.p1
         OR o."thirdTimeSeconds"  IS DISTINCT FROM agg.p3
         OR o."fifthTimeSeconds"  IS DISTINCT FROM agg.p5
         OR o."tenthTimeSeconds"  IS DISTINCT FROM agg.p10`;
    expect(conflicts).toEqual([]);
  });

  describe('EventScore snapshots', () => {
    const version = 'test_snapshot_v0';
    const eventId = 'demo-riverside-5k';
    const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
    const snapshot = (windowDays: number, asOf: string, pbScore: number) => ({
      eventId,
      calculationVersion: version,
      windowDays,
      asOfDate: date(asOf),
      pbScore,
    });
    afterAll(async () => db?.eventScore.deleteMany({ where: { calculationVersion: version } }));

    it('stores 30/60/90/365-day windows and historical as-of dates side by side', async () => {
      await db!.eventScore.createMany({
        data: [
          snapshot(30, '2026-09-26', 90),
          snapshot(60, '2026-09-26', 91),
          snapshot(90, '2026-09-26', 92),
          snapshot(365, '2026-09-26', 93),
          snapshot(90, '2026-09-19', 88),
        ],
      });
      expect(await db!.eventScore.count({ where: { calculationVersion: version } })).toBe(5);
    });

    it('rejects a duplicate (event, version, window, asOfDate) snapshot', async () => {
      await expect(db!.eventScore.create({ data: snapshot(90, '2026-09-26', 50) })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('serves the latest snapshot in the default 90-day window', async () => {
      const versioned = new PrismaDataStore(db!, version);
      const event = (await versioned.listActiveEvents()).find((e) => e.id === eventId);
      expect(event?.scores).toMatchObject({ windowDays: 90, asOfDate: '2026-09-26', pbScore: 92 });
    });
  });

  it('loads the demo user with visits', async () => {
    const user = await store!.getUser('demo-user');
    expect(user?.events.filter((e) => e.favourite).map((e) => e.eventId).sort()).toEqual([
      'demo-lakeside-5k',
      'demo-riverside-5k',
    ]);
  });
});
