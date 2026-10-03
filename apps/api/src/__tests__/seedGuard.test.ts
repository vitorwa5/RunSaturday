import { describe, expect, it } from 'vitest';
import { assertDemoSeedDatabase, requireDemoSeedOptIn } from '../demo/seedGuard';
import type { Db } from '../db/prisma';
import { createPrismaClient } from '../db/prisma';
import { randomUUID } from 'node:crypto';

describe('destructive demo seed guard', () => {
  const valid = { APP_MODE: 'demo', NODE_ENV: 'development', ALLOW_DESTRUCTIVE_DEMO_SEED: 'true' };
  it('requires explicit opt-in, demo mode and non-production before connecting', () => {
    expect(() => requireDemoSeedOptIn(valid)).not.toThrow();
    for (const change of [{ ALLOW_DESTRUCTIVE_DEMO_SEED: undefined }, { ALLOW_DESTRUCTIVE_DEMO_SEED: 'false' }, { APP_MODE: 'beta' }, { NODE_ENV: 'production' }]) {
      expect(() => requireDemoSeedOptIn({ ...valid, ...change })).toThrow(/Demo seed requires/);
    }
  });
  const database = (user: object | null, sessions = 0, accounts = 0) => ({ user: { findFirst: async () => user }, session: { count: async () => sessions }, account: { count: async () => accounts } }) as unknown as Db;
  it('accepts a database with no unexpected users and no auth identities', async () => {
    await expect(assertDemoSeedDatabase(database(null))).resolves.toBeUndefined();
  });
  it('refuses unexpected users, sessions and account identities', async () => {
    for (const db of [database({ id: 'real' }), database(null, 1), database(null, 0, 1)]) {
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/No data was deleted/);
    }
  });
  it.skipIf(!process.env.TEST_DATABASE_URL)('checks the established PostgreSQL demo fixture and refuses a real account without changing data', async () => {
    const db = createPrismaClient(process.env.TEST_DATABASE_URL!);
    const id = `seed-guard-${randomUUID()}`;
    try {
      const demo = await db.user.findUniqueOrThrow({ where: { id: 'demo-user' } });
      expect(demo).toMatchObject({ isDemo: true, email: null, emailVerified: false });
      await expect(assertDemoSeedDatabase(db)).resolves.toBeUndefined();
      const before = await db.userPerformance.count();
      await db.user.create({ data: { id, displayName: 'Seed guard fixture', email: `${id}@example.test`, emailVerified: true, isDemo: false } });
      await expect(assertDemoSeedDatabase(db)).rejects.toThrow(/No data was deleted/);
      expect(await db.user.findUnique({ where: { id } })).not.toBeNull();
      expect(await db.userPerformance.count()).toBe(before);
    } finally { await db.user.deleteMany({ where: { id } }); await db.$disconnect(); }
  });
});
