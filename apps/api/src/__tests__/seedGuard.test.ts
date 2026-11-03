import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDemoSeedDatabase, requireDemoSeedOptIn } from '../demo/seedGuard';
import type { Db } from '../db/prisma';
import { seededDemoFixture } from './fixtures/seededDemo';
import { randomUUID } from 'node:crypto';
import { CatalogueImportService } from '../catalogue/importService';

describe('destructive demo seed guard', () => {
  const valid = { APP_MODE: 'demo', NODE_ENV: 'development', ALLOW_DESTRUCTIVE_DEMO_SEED: 'true' };
  it('requires explicit opt-in, demo mode and non-production before connecting', () => {
    expect(() => requireDemoSeedOptIn(valid)).not.toThrow();
    for (const change of [{ ALLOW_DESTRUCTIVE_DEMO_SEED: undefined }, { ALLOW_DESTRUCTIVE_DEMO_SEED: 'false' }, { APP_MODE: 'beta' }, { NODE_ENV: 'production' }]) {
      expect(() => requireDemoSeedOptIn({ ...valid, ...change })).toThrow(/Demo seed requires/);
    }
  });
  const database = (user: object | null, sessions = 0, accounts = 0, importedEvents = 0) => ({ user: { findFirst: async () => user }, session: { count: async () => sessions }, account: { count: async () => accounts }, event: { count: async () => importedEvents } }) as unknown as Db;
  it('accepts a database with no unexpected users and no auth identities', async () => {
    await expect(assertDemoSeedDatabase(database(null))).resolves.toBeUndefined();
  });
  it('refuses unexpected users, sessions and account identities', async () => {
    for (const db of [database({ id: 'real' }), database(null, 1), database(null, 0, 1), database(null, 0, 0, 1)]) {
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/No data was deleted/);
    }
  });
  describe.skipIf(!process.env.TEST_DATABASE_URL)('isolated PostgreSQL DEMO schema', () => {
    const fixture = process.env.TEST_DATABASE_URL ? seededDemoFixture(process.env.TEST_DATABASE_URL, '2026-10-03') : null;
    beforeAll(async () => fixture!.setup(), 120_000);
    afterAll(async () => fixture?.cleanup(), 30_000);

    it('checks its migrated DEMO fixture and refuses a real account without changing data', async () => {
      const db = fixture!.db;
      const id = `seed-guard-${randomUUID()}`;
      const importedId = `${id}-catalogue`;
      const demo = await db.user.findUniqueOrThrow({ where: { id: 'demo-user' } });
      expect(demo).toMatchObject({ isDemo: true, email: null, emailVerified: false });
      await expect(assertDemoSeedDatabase(db)).resolves.toBeUndefined();
      const before = await db.userPerformance.count();
      await db.user.create({ data: { id, displayName: 'Seed guard fixture', email: `${id}@example.test`, emailVerified: true, isDemo: false } });
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/No data was deleted/);
      expect(await db.user.findUnique({ where: { id } })).not.toBeNull();
      expect(await db.userPerformance.count()).toBe(before);
      await db.user.delete({ where: { id } });
      await db.event.create({ data: { id: importedId, slug: importedId, name: 'Synthetic seed-guard catalogue fixture', country: 'Test', latitude: 0, longitude: 0, source: 'IMPORTED' } });
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/imported catalogue data/);
      expect(await db.event.findUnique({ where: { id: importedId } })).not.toBeNull();
      expect(await db.userPerformance.count()).toBe(before);
      await db.event.delete({ where: { id: importedId } });
      await new CatalogueImportService(db, 'beta').import({ format: '5k-compass-catalogue-v1', source: { namespace: id, kind: 'imported', attribution: 'Synthetic seed guard integration fixture' }, records: [
        { externalId: 'trusted', name: 'Trusted fixture', countryCode: 'GB', latitude: 53, longitude: -2, timezone: 'Europe/London', active: true },
      ] });
      const catalogue = await db.event.findMany({ where: { sourceNamespace: id } });
      const runs = await db.catalogueImportRun.findMany({ where: { sourceNamespace: id } });
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/imported catalogue data/);
      expect(await db.event.findMany({ where: { sourceNamespace: id } })).toEqual(catalogue);
      expect(await db.catalogueImportRun.findMany({ where: { sourceNamespace: id } })).toEqual(runs);
      expect(await db.userPerformance.count()).toBe(before);
    });
  });
});
