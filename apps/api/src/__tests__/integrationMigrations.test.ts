import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaClient, type Db } from '../db/prisma';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';
import { createAuth } from '../auth/auth';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';

const execute = promisify(execFile);
const url = process.env.TEST_DATABASE_URL;
const base = '92ce64d886ca76aa8a8b20c14e10ba7644ff36f2';
const catalogue = '20261003110000_catalogue_provenance';

/** Fresh schemas in the supplied test database: never reset shared fixtures or use another DB. */
describe.skipIf(!url)('B1.1 + B2A clean and realistic upgrade migrations', () => {
  const admin = createPrismaClient(url!);
  const resources: { schema: string; folder: string; db: Db }[] = [];
  afterAll(async () => {
    for (const resource of resources) {
      await resource.db.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${resource.schema}" CASCADE`);
      await rm(resource.folder, { recursive: true, force: true });
    }
    await admin.$disconnect();
  });

  async function sandbox(kind: string) {
    const schema = `integration_${kind}_${randomUUID().replaceAll('-', '')}`;
    const folder = await mkdtemp(join(tmpdir(), 'compass-migrations-'));
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, options: `-c search_path=${schema}` }, { schema }) });
    resources.push({ schema, folder, db });
    const scopedUrl = new URL(url!); scopedUrl.searchParams.set('schema', schema);
    await mkdir(join(folder, 'migrations'));
    const config = join(folder, 'prisma.config.mjs');
    await writeFile(config, `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(join(folder, 'migrations'))} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const migrate = async (command: 'deploy' | 'status') => execute(process.execPath, [resolve('../../node_modules/prisma/build/index.js'), 'migrate', command, '--config', config], {
      env: { ...process.env, DATABASE_URL: scopedUrl.toString() }, timeout: 60_000,
    });
    return { schema, folder, db, migrate, scopedUrl: scopedUrl.toString() };
  }

  async function fingerprint(db: Db, schema: string) {
    const columns = await db.$queryRaw`SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = ${schema} AND table_name <> '_prisma_migrations'
      ORDER BY table_name, ordinal_position`;
    const constraints = await db.$queryRaw`SELECT c.relname, k.conname, k.contype::text, pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=${schema} AND c.relname <> '_prisma_migrations' ORDER BY c.relname,k.conname`;
    const indexes = await db.$queryRaw`SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname=${schema} AND tablename <> '_prisma_migrations' ORDER BY tablename,indexname`;
    return JSON.parse(JSON.stringify({ columns, constraints, indexes }).replaceAll(schema, 'test_schema'));
  }

  async function starts(db: Db, scopedUrl: string) {
    const config = loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATABASE_URL: scopedUrl, AUTH_BASE_URL: 'https://example.test', AUTH_SECRET: 'integration-migration-test-secret-32-characters', EMAIL_TRANSPORT: 'test', LOG_LEVEL: 'silent' });
    const store = new PrismaDataStore(db, 'demo_v0', 'beta');
    const app = await buildApp({ config, store, authRuntime: { db, auth: createAuth(db, config, { async send() {} }) }, logger: false });
    try {
      await app.listen({ host: '127.0.0.1', port: 0 });
      expect((await app.inject('/api/health')).statusCode).toBe(200);
      expect((await app.inject('/api/account/session')).json()).toEqual({ mode: 'beta', user: null });
      expect((await app.inject('/api/events')).json()).toEqual([]);
      await Promise.all([db.account.count(), db.session.count(), db.emailAuthBudget.count(), db.catalogueImportRun.count(), db.runnerFormSnapshot.findMany({ select: { evidenceScope: true } })]);
    } finally { await app.close(); }
  }

  it('deploys a clean schema and upgrades the exact B1 migration history without changing existing data', { timeout: 120_000 }, async () => {
    const clean = await sandbox('clean');
    await cp(resolve('prisma/migrations'), join(clean.folder, 'migrations'), { recursive: true });
    await clean.migrate('deploy');
    expect((await clean.migrate('status')).stdout).toContain('Database schema is up to date');
    const expectedSchema = await fingerprint(clean.db, clean.schema);
    const names = expectedSchema.constraints.map((row: { conname: string }) => row.conname);
    for (const name of ['Event_catalogue_identity_complete', 'Event_catalogueImportRunId_fkey', 'UserPerformance_eventId_fkey', 'Account_userId_fkey', 'Session_userId_fkey']) expect(names).toContain(name);
    const indexes = expectedSchema.indexes.map((row: { indexname: string }) => row.indexname);
    for (const name of ['Event_sourceNamespace_externalId_key', 'Account_providerId_accountId_key', 'Session_token_key', 'EmailAuthBudget_expiresAt_idx']) expect(indexes).toContain(name);
    await starts(clean.db, clean.scopedUrl);

    const upgrade = await sandbox('upgrade');
    const files = (await execute('git', ['ls-tree', '-r', '--name-only', base, 'apps/api/prisma/migrations'], { cwd: resolve('../..') })).stdout.trim().split('\n');
    for (const file of files) {
      const target = join(upgrade.folder, file.replace('apps/api/prisma/', ''));
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, (await execute('git', ['show', `${base}:${file}`], { cwd: resolve('../..') })).stdout);
    }
    await upgrade.migrate('deploy');
    const applied = await upgrade.db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    expect(applied.map(row => row.migration_name)).toContain('20261003120000_email_auth_budgets');
    expect(applied.map(row => row.migration_name)).not.toContain(catalogue);
    // SQL targets the actual B1 schema; the generated B2A client cannot fabricate new columns.
    await upgrade.db.$executeRaw`INSERT INTO "User" (id,"displayName",email,"emailVerified","isDemo","updatedAt") VALUES ('existing-user','Existing runner','existing@example.test',true,false,NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "Event" (id,slug,name,country,latitude,longitude,source,"updatedAt") VALUES ('existing-event','existing-event','Legacy imported','United Kingdom',53,-2,'IMPORTED',NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "UserPerformance" (id,"userId","eventId",date,"finishTimeSeconds","duplicateKey","updatedAt") VALUES ('existing-run','existing-user','existing-event','2026-09-20',1234,'existing-key',NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "UserEvent" ("userId","eventId",favourite,"updatedAt") VALUES ('existing-user','existing-event',true,NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "Account" (id,"userId","accountId","providerId","updatedAt") VALUES ('existing-account','existing-user','existing-user','fixture',NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "Session" (id,"userId",token,"expiresAt","updatedAt") VALUES ('existing-session','existing-user','test-session-token',NOW()+INTERVAL '7 days',NOW())`;
    await upgrade.db.$executeRaw`INSERT INTO "EmailAuthBudget" (key,email,count,"windowStartedAt","expiresAt") VALUES ('existing-budget','existing@example.test',4,NOW(),NOW()+INTERVAL '10 minutes')`;
    await upgrade.db.$executeRaw`INSERT INTO "Verification" (id,identifier,value,"expiresAt","updatedAt") VALUES ('existing-verification','fixture','test-only-hash',NOW()+INTERVAL '5 minutes',NOW())`;
    const tables = ['User', 'Event', 'UserPerformance', 'UserEvent', 'Account', 'Session', 'EmailAuthBudget', 'Verification'];
    const before = new Map<string, Record<string, unknown>[]>();
    for (const table of tables) before.set(table, (await upgrade.db.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS row FROM "${table}" t`)).map(item => item.row));
    await cp(resolve('prisma/migrations', catalogue), join(upgrade.folder, 'migrations', catalogue), { recursive: true });
    await upgrade.migrate('deploy');
    expect((await upgrade.migrate('status')).stdout).toContain('Database schema is up to date');
    for (const table of tables) {
      const rows = (await upgrade.db.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS row FROM "${table}" t`)).map(item => item.row);
      const keys = Object.keys(before.get(table)![0]!);
      expect(rows.map(row => Object.fromEntries(keys.map(key => [key, row[key]]))), table).toEqual(before.get(table));
    }
    expect(await fingerprint(upgrade.db, upgrade.schema)).toEqual(expectedSchema);
    const store = new PrismaDataStore(upgrade.db, 'demo_v0', 'beta');
    expect(await store.listTrustedEventIds(['existing-event'])).toEqual([]);
    expect(await store.listUserPerformances('existing-user')).toMatchObject([{ id: 'existing-run', eventId: 'existing-event', finishTimeSeconds: 1234 }]);
    await starts(upgrade.db, upgrade.scopedUrl);
  });
});
