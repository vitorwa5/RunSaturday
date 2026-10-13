import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('B3 additive migration on the supplied test database', () => {
  it('supports clean installation and realistic main upgrade without losing references', async () => {
    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    const prefix = `b3_migration_${randomUUID().replaceAll('-', '')}`;
    const migrations = (await readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort();
    const schemas = [`${prefix}_clean`, `${prefix}_upgrade`];
    try {
      for (const [i, schema] of schemas.entries()) {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        for (const migration of migrations) {
          if (i === 1 && migration === '20261013120000_onboarding_completion') {
            // Current main account and canonical external performance, plus disposable demo user.
            await client.query('INSERT INTO "User" (id, "displayName", "emailVerified", "homeLat", "homeLon", "homeLabel", "defaultTravelMinutes", "updatedAt") VALUES (\'real-upgrade\', \'Real\', true, 53.4, -2.6, \'Area\', 45, NOW())');
            await client.query('INSERT INTO "User" (id, "displayName", "isDemo", "updatedAt") VALUES (\'demo-user\', \'Demo\', true, NOW())');
            await client.query('INSERT INTO "UserPerformance" (id, "userId", "externalEventName", "performanceType", "distanceMeters", date, "finishTimeSeconds", source, "duplicateKey", "updatedAt") VALUES (\'recorded-run\', \'real-upgrade\', \'Recorded 5K\', \'OTHER_RACE\', 5000, \'2026-09-20\', 1200, \'MANUAL\', \'external:recorded|2026-09-20|5000\', NOW())');
          }
          await client.query('BEGIN');
          try { await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8')); await client.query('COMMIT'); }
          catch (error) { await client.query('ROLLBACK'); throw error; }
        }
        const column = await client.query('SELECT is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name=\'User\' AND column_name=\'onboardingCompletedAt\'', [schema]);
        expect(column.rows).toEqual([{ is_nullable: 'YES' }]);
        if (i === 1) {
          const account = (await client.query('SELECT * FROM "User" WHERE id=\'real-upgrade\'')).rows[0];
          expect(account).toMatchObject({ homeLat: 53.4, homeLon: -2.6, homeLabel: 'Area', defaultTravelMinutes: 45, onboardingCompletedAt: null });
          expect((await client.query('SELECT "userId", "finishTimeSeconds" FROM "UserPerformance" WHERE id=\'recorded-run\'')).rows).toEqual([{ userId: 'real-upgrade', finishTimeSeconds: 1200 }]);
          expect((await client.query('SELECT "onboardingCompletedAt" FROM "User" WHERE id=\'demo-user\'')).rows[0].onboardingCompletedAt).not.toBeNull();
        }
      }
    } finally {
      await client.query('SET search_path TO public');
      // Only the two test-owned random schemas above; never touch application/test public data.
      for (const schema of schemas) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release(); await pool.end();
    }
  });
});
