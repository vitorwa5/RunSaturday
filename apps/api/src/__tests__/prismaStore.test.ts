/**
 * Integration test against a real, seeded PostgreSQL database. Skipped unless
 * TEST_DATABASE_URL is set, e.g.:
 *
 *   TEST_DATABASE_URL=postgresql://runsaturday:runsaturday@localhost:5432/runsaturday npm test -w @runsaturday/api
 */
import { calendarDateIn } from '@runsaturday/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { recalculateAnalytics } from '../analytics/recalculate';
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

  it('counts faster results in SQL exactly as the in-memory store does', async () => {
    for (const time of [900, 1170, 1500, 2400]) {
      const [db_, mem] = await Promise.all([
        store!.listPlacementInputs(time, null, '2026-04-01', today),
        memory.listPlacementInputs(time, null, '2026-04-01', today),
      ]);
      const key = (r: { eventId: string; date: string }) => `${r.eventId}|${r.date}`;
      const sort = <T extends { eventId: string; date: string }>(rows: T[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
      expect(sort(db_)).toEqual(sort(mem));
    }
    const subset = await store!.listPlacementInputs(1170, ['demo-riverside-5k'], null, today);
    expect(new Set(subset.map((r) => r.eventId))).toEqual(new Set(['demo-riverside-5k']));
    expect(await store!.listPlacementInputs(1170, [], null, today)).toEqual([]);
  });

  it('derives the same competition inputs from Result rows in SQL as in memory', async () => {
    const key = (r: { eventId: string; date: string }) => `${r.eventId}|${r.date}`;
    const sort = <T extends { eventId: string; date: string }>(rows: T[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
    expect(sort(await store!.listCompetitionInputs(today))).toEqual(sort(await memory.listCompetitionInputs(today)));
  });

  it('recalculates analytics idempotently and serves the same snapshots as the demo store', { timeout: 60_000 }, async () => {
    const asOfDate = new Date(`${today}T00:00:00Z`);
    const count = async () => [
      await db!.eventScore.count({ where: { calculationVersion: { in: ['competition_v1', 'difficulty_v1', 'pb_v1'] }, asOfDate } }),
      await db!.courseFactorSnapshot.count({ where: { asOfDate } }),
    ];
    await recalculateAnalytics(db!, today);
    const first = await count();
    await recalculateAnalytics(db!, today);
    expect(await count()).toEqual(first);
    expect(first[1]).toBe(10);
    for (const id of ['demo-riverside-5k', 'demo-heath-common-5k', 'demo-dockside-promenade-5k']) {
      for (const windowDays of [30, 90, 0]) {
        expect(await store!.getAnalytics(id, windowDays)).toEqual(await memory.getAnalytics(id, windowDays));
      }
    }
    const strip = (e: Awaited<ReturnType<MemoryDataStore['listActiveEvents']>>[number]) => [
      e.id,
      e.scores?.competitionScore,
      e.scores?.difficultyScore,
      e.scores?.pbScore,
      e.scores?.courseSpeedFactor,
      e.scores?.courseSpeedConfidence,
    ];
    expect((await store!.listActiveEvents()).map(strip)).toEqual((await memory.listActiveEvents()).map(strip));
  });

  it('stores Course Speed Factors with aligned bootstrap draws identical to the demo store', async () => {
    const byId = <T extends { eventId: string }>(rows: T[]) => [...rows].sort((a, b) => a.eventId.localeCompare(b.eventId));
    const [fromDb, fromMemory] = [byId(await store!.listCourseFactors()), byId(await memory.listCourseFactors())];
    // Scalars round-trip exactly; float8[] draws may differ in the 17th significant digit.
    expect(fromDb.map(({ bootstrap: _b, ...f }) => f)).toEqual(fromMemory.map(({ bootstrap: _b, ...f }) => f));
    fromDb.forEach((f, i) => {
      expect(f.bootstrap).toHaveLength(fromMemory[i]!.bootstrap.length);
      f.bootstrap.forEach((v, b) => expect(Math.abs(v - fromMemory[i]!.bootstrap[b]!)).toBeLessThan(1e-12));
    });
  });

  it('reads the same matched-runner performances in SQL as in memory', async () => {
    const key = (p: { athleteKey: string; eventId: string; date: string }) => `${p.athleteKey}|${p.eventId}|${p.date}`;
    const sort = <T extends { athleteKey: string; eventId: string; date: string }>(rows: T[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
    const from = '2026-06-01';
    expect(sort(await store!.listPerformances(from, today))).toEqual(sort(await memory.listPerformances(from, today)));
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
      gemBaseScore: pbScore,
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

    it('serves the latest legacy snapshot in the default 90-day window (PB Score comes from pb_v1 only)', async () => {
      const versioned = new PrismaDataStore(db!, version);
      const event = (await versioned.listActiveEvents()).find((e) => e.id === eventId);
      expect(event?.scores).toMatchObject({ windowDays: 90, gemBaseScore: 92, calculationVersion: 'pb_v1' });
      expect(event?.scores?.pbScore).not.toBe(92);
    });
  });

  it('loads the demo user with visits', async () => {
    const user = await store!.getUser('demo-user');
    expect(user?.events.filter((e) => e.favourite).map((e) => e.eventId).sort()).toEqual([
      'demo-lakeside-5k',
      'demo-riverside-5k',
    ]);
    expect(user?.recentPbEvent).toEqual({ id: 'demo-riverside-5k', name: 'Riverside 5K' });
    expect(user?.lifetimePbEvent).toEqual(await memory.getUser('demo-user').then((u) => u?.lifetimePbEvent));
  });
});
