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

  it('searches case-insensitively in SQL', async () => {
    expect((await store!.searchEvents('wIgAn', 10)).map((e) => e.name)).toEqual(['Canal Towpath 5K']);
  });

  it('loads the demo user with visits', async () => {
    const user = await store!.getUser('demo-user');
    expect(user?.events.filter((e) => e.favourite).map((e) => e.eventId).sort()).toEqual([
      'demo-lakeside-5k',
      'demo-riverside-5k',
    ]);
  });
});
