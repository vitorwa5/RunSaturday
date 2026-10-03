import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createAuth } from '../auth/auth';
import { consumeEmailBudget } from '../auth/emailBudget';
import { loadConfig } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { PrismaDataStore } from '../repositories/prisma/PrismaDataStore';

const url = process.env.TEST_DATABASE_URL;
const run = randomUUID();
const origin = 'http://localhost:5173';

describe.skipIf(!url)('persistent product email budgets independent of Better Auth cleanup', () => {
  const db = createPrismaClient(url!);
  const config = loadConfig({ APP_MODE: 'beta', NODE_ENV: 'test', DATA_SOURCE: 'database', DATABASE_URL: url,
    AUTH_BASE_URL: origin, AUTH_ALLOW_INSECURE_LOCAL_HTTP: 'true', AUTH_SECRET: 'email-budget-test-secret-at-least-32-characters', EMAIL_TRANSPORT: 'test' });
  let app: FastifyInstance;
  let now = new Date();
  let ip = 0;
  const email = (label: string) => `${label}-${run}@example.test`;
  const request = (action: 'send' | 'verify', address: string) => app.inject({ method: 'POST',
    remoteAddress: `10.72.${Math.floor(++ip / 250)}.${ip % 250 + 1}`,
    url: action === 'send' ? '/api/auth/email-otp/send-verification-otp' : '/api/auth/sign-in/email-otp',
    headers: { origin }, payload: action === 'send' ? { email: address } : { email: address, otp: '123456' } });

  beforeAll(async () => {
    app = await buildApp({ config, store: new PrismaDataStore(db, 'demo_v0'), logger: false,
      authRuntime: { db, auth: createAuth(db, config, { async send() {} }), emailBudgetNow: () => now } });
  });
  afterAll(async () => {
    await app?.close();
    await db.emailAuthBudget.deleteMany({ where: { email: { contains: run } } });
    await db.verification.deleteMany({ where: { identifier: { contains: run } } });
    await db.rateLimit.deleteMany({ where: { OR: [{ key: { contains: run } }, { key: { startsWith: '10.72.' } }] } });
    await db.$disconnect();
  });

  it('retains both exhausted budgets after actual Better Auth cleanup at 61 seconds, then resets at 600 seconds', async () => {
    const start = new Date(); now = start;
    const sendEmail = email('window-send'); const verifyEmail = email('window-verify');
    for (let n = 0; n < 5; n++) expect((await request('send', sendEmail)).statusCode).toBe(200);
    expect((await request('send', sendEmail)).statusCode).toBe(429);
    for (let n = 0; n < 15; n++) expect((await request('verify', verifyEmail)).statusCode).toBe(400);
    expect((await request('verify', verifyEmail)).statusCode).toBe(429);
    const rows = await db.emailAuthBudget.findMany({ where: { email: { in: [sendEmail, verifyEmail] } }, orderBy: { key: 'asc' } });
    expect(rows.map((row) => row.count).sort((a, b) => a - b)).toEqual([6, 16]);
    expect(rows.every((row) => row.expiresAt.getTime() === start.getTime() + 600_000)).toBe(true);

    const cleanupRequest = () => app.inject({ method: 'POST', url: '/api/auth/sign-out', remoteAddress: '10.72.99.99', headers: { origin }, payload: {} });
    expect((await cleanupRequest()).statusCode).toBe(200);
    const old = BigInt(Date.now() - 61_000);
    const aged = await db.rateLimit.updateMany({ where: { key: { startsWith: '10.72.99.99' } }, data: { lastRequest: old } });
    expect(aged.count).toBeGreaterThan(0);
    const sentinel = `cleanup-sentinel-${run}`;
    await db.rateLimit.create({ data: { key: sentinel, count: 1, lastRequest: old } });
    now = new Date(start.getTime() + 61_000);
    expect((await cleanupRequest()).statusCode).toBe(200);
    // The library really pruned its own table; no mocked cleanup or copied implementation.
    expect(await db.rateLimit.findUnique({ where: { key: sentinel } })).toBeNull();
    expect(await db.emailAuthBudget.findMany({ where: { email: { in: [sendEmail, verifyEmail] } }, orderBy: { key: 'asc' } })).toEqual(rows);
    expect((await request('send', sendEmail)).statusCode).toBe(429);
    expect((await request('verify', verifyEmail)).statusCode).toBe(429);
    now = new Date(start.getTime() + 599_999);
    expect((await request('send', sendEmail)).statusCode).toBe(429);
    expect((await request('verify', verifyEmail)).statusCode).toBe(429);
    now = new Date(start.getTime() + 600_000);
    expect((await request('send', sendEmail)).statusCode).toBe(200);
    expect((await request('verify', verifyEmail)).statusCode).toBe(400);
    const reset = await db.emailAuthBudget.findMany({ where: { email: { in: [sendEmail, verifyEmail] } } });
    expect(reset.every((row) => row.count === 1 && row.windowStartedAt.getTime() === now.getTime() && row.expiresAt.getTime() === now.getTime() + 600_000)).toBe(true);
  });

  it('allows exactly five concurrent sends and fifteen concurrent verifications across IPs', async () => {
    now = new Date();
    const sendEmail = email('concurrent-send'); const verifyEmail = email('concurrent-verify');
    const sends = await Promise.all(Array.from({ length: 12 }, () => request('send', sendEmail)));
    expect(sends.filter((r) => r.statusCode === 200)).toHaveLength(5);
    expect(sends.filter((r) => r.statusCode === 429)).toHaveLength(7);
    const verifies = await Promise.all(Array.from({ length: 20 }, () => request('verify', verifyEmail)));
    expect(verifies.filter((r) => r.statusCode === 400)).toHaveLength(15);
    expect(verifies.filter((r) => r.statusCode === 429)).toHaveLength(5);
    expect((await db.emailAuthBudget.findUniqueOrThrow({ where: { key: `email:${sendEmail}:send` } })).count).toBe(12);
    expect((await db.emailAuthBudget.findUniqueOrThrow({ where: { key: `email:${verifyEmail}:verify` } })).count).toBe(20);
  });

  it('persists across independent clients and cleans only expired product windows', async () => {
    now = new Date();
    const address = email('persistent');
    for (let n = 0; n < 5; n++) await consumeEmailBudget(db, address, 'send', now);
    const secondDb = createPrismaClient(url!);
    try {
      await expect(consumeEmailBudget(secondDb, address, 'send', new Date(now.getTime() + 60_001))).rejects.toMatchObject({ statusCode: 429 });
      expect((await secondDb.emailAuthBudget.findUniqueOrThrow({ where: { key: `email:${address}:send` } })).count).toBe(6);
      const expiredEmail = email('expired');
      await db.emailAuthBudget.create({ data: { key: `email:${expiredEmail}:send`, email: expiredEmail, count: 5, windowStartedAt: new Date(now.getTime() - 600_000), expiresAt: now } });
      await consumeEmailBudget(secondDb, email('cleanup'), 'send', now);
      expect(await db.emailAuthBudget.findUnique({ where: { key: `email:${expiredEmail}:send` } })).toBeNull();
      expect(await db.emailAuthBudget.findUnique({ where: { key: `email:${address}:send` } })).not.toBeNull();
    } finally { await secondDb.$disconnect(); }
  });

  it('backfills surviving legacy budgets without copying expired or IP rows', async () => {
    const migration = await readFile(new URL('../../prisma/migrations/20261003120000_email_auth_budgets/migration.sql', import.meta.url), 'utf8');
    const backfill = migration.slice(migration.indexOf('INSERT INTO'));
    const start = Date.now() - 120_000;
    const address = email('migration');
    await db.$transaction(async (tx) => {
      // Temporary tables shadow the real tables for this connection only; the actual backfill SQL runs unchanged.
      await tx.$executeRaw`CREATE TEMP TABLE "RateLimit" (LIKE public."RateLimit" INCLUDING DEFAULTS) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE "EmailAuthBudget" (LIKE public."EmailAuthBudget" INCLUDING DEFAULTS) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES
        ('send', ${`email:${address}:send`}, 5, ${BigInt(start)}),
        ('verify', ${`email:${address}:verify`}, 15, ${BigInt(start)}),
        ('expired', ${`email:${email('migration-expired')}:send`}, 5, ${BigInt(start - 600_000)}),
        ('ip', '10.72.0.1|/sign-out', 1, ${BigInt(start)})`;
      await tx.$executeRawUnsafe(backfill);
      const rows = await tx.$queryRaw<{ key: string; email: string; count: number; windowStartedAt: Date; expiresAt: Date }[]>`SELECT * FROM "EmailAuthBudget" ORDER BY key`;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.count)).toEqual([5, 15]);
      expect(rows.every((row) => row.email === address && row.windowStartedAt.getTime() === start && row.expiresAt.getTime() === start + 600_000)).toBe(true);
    });
  });
});
