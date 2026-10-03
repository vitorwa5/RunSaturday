/**
 * Integration test against a real, seeded PostgreSQL database. Skipped unless
 * TEST_DATABASE_URL is set, e.g.:
 *
 *   TEST_DATABASE_URL=postgresql://runsaturday:runsaturday@localhost:5432/runsaturday npm test -w @runsaturday/api
 */
import { calendarDateIn } from '@runsaturday/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recalculateAnalytics } from '../analytics/recalculate';
import { createPrismaClient } from '../db/prisma';
import { MemoryDataStore } from '../repositories/memory/MemoryDataStore';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';
import { DuplicatePerformanceError } from '../repositories/DataStore';
import { refreshAllAnalytics } from '../analytics/refreshAll';
import { computeUserRunnerForm, recalculateRunnerForm } from '../services/runnerForm';
import { loadUser } from '../services/userPerformance';
import { eventVisitSummary, exploreSummary, loadExploreState } from '../services/explore';

const url = process.env.TEST_DATABASE_URL;
const FIVE_K_PARKRUN = { externalEventName: null, performanceType: 'parkrun' as const, distanceMeters: 5000 };

describe.skipIf(!url)('PrismaDataStore (seeded database)', () => {
  const today = calendarDateIn(new Date(), 'Europe/London');
  const db = url ? createPrismaClient(url) : null;
  const store = db ? new PrismaDataStore(db, 'demo_v0', 'demo') : null;
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
    await recalculateAnalytics(db!, today, 'demo');
    const first = await count();
    await recalculateAnalytics(db!, today, 'demo');
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
      const versioned = new PrismaDataStore(db!, version, 'demo');
      const event = (await versioned.listActiveEvents()).find((e) => e.id === eventId);
      expect(event?.scores).toMatchObject({ windowDays: 90, gemBaseScore: 92, calculationVersion: 'pb_v1' });
      expect(event?.scores?.pbScore).not.toBe(92);
    });
  });

  it('loads the demo user settings and favourites identically', async () => {
    const user = await store!.getUser('demo-user');
    expect(user?.favouriteEventIds).toEqual(['demo-lakeside-5k', 'demo-riverside-5k']);
    expect(user).toEqual(await memory.getUser('demo-user'));
  });

  it('stores the demo user\'s performances and derives the same values as the demo store', async () => {
    expect(await store!.listUserPerformances('demo-user')).toEqual(await memory.listUserPerformances('demo-user'));
    expect(await store!.listUserPerformances('demo-user', { eventId: 'demo-lakeside-5k' })).toEqual(
      await memory.listUserPerformances('demo-user', { eventId: 'demo-lakeside-5k' }),
    );
    const [fromDb, fromMemory] = await Promise.all([loadUser(store!, 'demo-user', today), loadUser(memory, 'demo-user', today)]);
    expect(fromDb).toEqual(fromMemory);
    expect(fromDb?.lifetimePbSeconds).toBe(1138);
    // The 43 migrated demo rows: all 5000 m parkruns at known events, keyed by event and date.
    const rows = await db!.userPerformance.findMany({ where: { userId: 'demo-user' } });
    expect(rows).toHaveLength(43);
    expect(rows.every((r) => r.distanceMeters === 5000 && r.performanceType === 'PARKRUN' && r.externalEventName === null && r.eventId != null)).toBe(true);
    expect(rows.every((r) => r.duplicateKey === `event:${r.eventId}|${r.date.toISOString().slice(0, 10)}|5000`)).toBe(true);
    expect(fromDb?.recentPbEvent).toEqual({ id: 'demo-riverside-5k', name: 'Riverside 5K' });
  });

  it('derives identical visits, Explore summary and challenge progress in SQL and in memory (Phase 5A)', async () => {
    const [fromDb, fromMemory] = await Promise.all([loadExploreState(store!, 'demo-user', today), loadExploreState(memory, 'demo-user', today)]);
    expect(fromDb.history).toEqual(fromMemory.history);
    expect(fromDb.challenges).toEqual(fromMemory.challenges);
    expect(exploreSummary(fromDb)).toEqual(exploreSummary(fromMemory));
    expect(fromDb.challenges[0]!.completedItems).toEqual(['F', 'L', 'R', 'V']);
    for (const id of ['demo-riverside-5k', 'demo-moorland-edge-5k']) {
      const event = fromDb.context.events.find((e) => e.id === id)!;
      expect(eventVisitSummary(fromDb, event)).toEqual(eventVisitSummary(fromMemory, event));
    }
  });

  it('stores Current Form snapshots that match the demo store, replacing same-day recalculations', async () => {
    const [fromDb, fromMemory] = [await recalculateRunnerForm(store!, 'demo-user', today), await recalculateRunnerForm(memory, 'demo-user', today)];
    expect(fromDb).toEqual(fromMemory);
    expect(fromDb.status).toBe('estimate');
    await recalculateRunnerForm(store!, 'demo-user', today);
    const rows = await db!.runnerFormSnapshot.findMany({ where: { userId: 'demo-user', asOfDate: new Date(`${today}T00:00:00Z`) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ distanceMeters: 5000, calculationVersion: 'runner_form_v1', status: 'ESTIMATE', formSeconds: fromDb.formSeconds, confidence: fromDb.confidence.level.toUpperCase() });
    expect(await store!.getRunnerFormSnapshot('demo-user', 5000, 'runner_form_v1', today)).toEqual(fromDb);
    expect(await store!.getRunnerFormSnapshot('demo-user', 5000, 'runner_form_v1', '2000-01-01')).toBeNull();
  });

  it('canonical refresh rewrites Current Form from the factors it has just recalculated (no stale form)', { timeout: 60_000 }, async () => {
    const asOfDate = new Date(`${today}T00:00:00Z`);
    await refreshAllAnalytics(db!, today, 'demo');
    // Simulate stale state: a factor changed and the stored form still reflects something else.
    await db!.courseFactorSnapshot.updateMany({ where: { eventId: 'demo-riverside-5k', asOfDate }, data: { factor: 2 } });
    await db!.runnerFormSnapshot.updateMany({ where: { userId: 'demo-user', asOfDate }, data: { formSeconds: 1 } });
    const stale = await db!.runnerFormSnapshot.findFirstOrThrow({ where: { userId: 'demo-user', asOfDate } });
    expect(stale.formSeconds).toBe(1);

    const { runnerForms } = await refreshAllAnalytics(db!, today, 'demo');
    expect(runnerForms.users).toBeGreaterThanOrEqual(1);
    const factor = (await db!.courseFactorSnapshot.findFirstOrThrow({ where: { eventId: 'demo-riverside-5k', asOfDate } })).factor;
    expect(factor).not.toBe(2); // factors recalculated first…
    const form = (await store!.getRunnerFormSnapshot('demo-user', 5000, 'runner_form_v1', today))!;
    expect(form.inputs.find((i) => i.eventId === 'demo-riverside-5k')!.courseFactor).toBe(factor); // …then the form, from them
    expect(form).toEqual(await computeUserRunnerForm(store!, 'demo-user', today));
    expect((await db!.runnerFormSnapshot.findFirstOrThrow({ where: { userId: 'demo-user', asOfDate } })).formSeconds).toBe(form.formSeconds);
  });

  describe('UserPerformance (personal data)', () => {
    const owner = 'test-perf-owner';
    const other = 'test-perf-other';
    beforeAll(async () => {
      await db!.user.deleteMany({ where: { id: { in: [owner, other] } } });
      await db!.user.createMany({ data: [{ id: owner, displayName: 'Owner' }, { id: other, displayName: 'Other' }] });
    });
    afterAll(async () => db?.user.deleteMany({ where: { id: { in: [owner, other] } } }));

    it('creates, edits and deletes a manual performance, scoped to its user', async () => {
      const created = await store!.createUserPerformance(owner, { ...FIVE_K_PARKRUN, eventId: 'demo-lakeside-5k', date: '2026-08-01', finishTimeSeconds: 1300, source: 'manual' });
      expect(created).toMatchObject({ userId: owner, eventName: 'Lakeside 5K', date: '2026-08-01', source: 'manual', verified: false });
      // Another user can neither see nor change it.
      expect(await store!.listUserPerformances(other)).toEqual([]);
      expect(await store!.getUserPerformance(other, created.id)).toBeNull();
      expect(await store!.updateUserPerformance(other, created.id, { ...FIVE_K_PARKRUN, eventId: 'demo-lakeside-5k', date: '2026-08-01', finishTimeSeconds: 1 })).toBeNull();
      expect(await store!.deleteUserPerformance(other, created.id)).toBe(false);

      const updated = await store!.updateUserPerformance(owner, created.id, { ...FIVE_K_PARKRUN, eventId: 'demo-riverside-5k', date: '2026-08-08', finishTimeSeconds: 1290 });
      expect(updated).toMatchObject({ id: created.id, eventName: 'Riverside 5K', date: '2026-08-08', finishTimeSeconds: 1290 });
      expect(await store!.deleteUserPerformance(owner, created.id)).toBe(true);
      expect(await store!.listUserPerformances(owner)).toEqual([]);
    });

    it('rejects a duplicate (user, event, date) in SQL as in memory, but allows it for another user', async () => {
      const input = { ...FIVE_K_PARKRUN, eventId: 'demo-heath-common-5k', date: '2026-07-04', finishTimeSeconds: 1400, source: 'manual' as const };
      await store!.createUserPerformance(owner, input);
      await expect(store!.createUserPerformance(owner, { ...input, finishTimeSeconds: 1500 })).rejects.toBeInstanceOf(DuplicatePerformanceError);
      await expect(store!.createUserPerformance(other, input)).resolves.toMatchObject({ userId: other });
      const second = await store!.createUserPerformance(owner, { ...input, date: '2026-07-11' });
      await expect(store!.updateUserPerformance(owner, second.id, { ...input })).rejects.toBeInstanceOf(DuplicatePerformanceError);
    });

    it('stores an external 5K race by name (no Event row) and de-duplicates it by normalised name in SQL', async () => {
      const eventCount = await db!.event.count();
      const external = { eventId: null, externalEventName: '  Warrington   5K ', performanceType: 'road_race' as const, distanceMeters: 5000, date: '2026-06-13', finishTimeSeconds: 1165, source: 'manual' as const };
      const created = await store!.createUserPerformance(owner, external);
      expect(created).toMatchObject({ eventId: null, eventName: null, externalEventName: 'Warrington 5K', performanceType: 'road_race', distanceMeters: 5000 });
      expect(await db!.event.count()).toBe(eventCount);
      expect((await db!.userPerformance.findUniqueOrThrow({ where: { id: created.id } })).duplicateKey).toBe('external:warrington 5k|2026-06-13|5000');
      await expect(store!.createUserPerformance(owner, { ...external, externalEventName: 'warrington 5k' })).rejects.toBeInstanceOf(DuplicatePerformanceError);
      await expect(store!.createUserPerformance(owner, { ...external, date: '2026-06-20' })).resolves.toMatchObject({ externalEventName: 'Warrington 5K' });
      // Same answers as the in-memory store.
      const [fromDb, fromMemory] = [await loadUser(store!, owner, today), await loadUser(memory, 'demo-user', today)];
      expect(fromDb?.performance.lifetimePb).toMatchObject({ eventId: null, eventName: 'Warrington 5K', courseModelled: false });
      expect(fromMemory?.performance.parkrunPb?.performanceType).toBe('parkrun');
    });

    it('enforces "exactly one location" in the database itself', async () => {
      const base = { userId: owner, date: new Date('2026-05-02T00:00:00Z'), finishTimeSeconds: 1200, duplicateKey: 'check-test' };
      await expect(db!.userPerformance.create({ data: { ...base } })).rejects.toThrow();
      await expect(db!.userPerformance.create({ data: { ...base, eventId: 'demo-riverside-5k', externalEventName: 'Both' } })).rejects.toThrow();
      expect(await db!.userPerformance.count({ where: { duplicateKey: 'check-test' } })).toBe(0);
    });
  });
});
