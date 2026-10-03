import { calendarDateIn } from '@runsaturday/shared';
import { createAuth } from './auth/auth';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import { createPrismaClient } from './db/prisma';
import type { DataStore } from './repositories/DataStore';
import { MemoryDataStore } from './repositories/memory/MemoryDataStore';
import { PrismaDataStore } from './repositories/prisma/PrismaDataStore';

async function main() {
  const config = loadConfig();
  const db = config.DATA_SOURCE === 'database' ? createPrismaClient(config.DATABASE_URL!) : undefined;
  const store: DataStore =
    config.DATA_SOURCE === 'demo'
      ? new MemoryDataStore(calendarDateIn(new Date(), config.APP_TIME_ZONE))
      : new PrismaDataStore(db!, config.ACTIVE_SCORE_VERSION);

  const app = await buildApp({ config, store, authRuntime: config.APP_MODE === 'beta' ? { db: db!, auth: createAuth(db!, config) } : undefined });

  if (store.kind === 'database' && !(await store.ping())) {
    if (config.APP_MODE === 'beta') throw new Error('Beta database is unavailable');
    app.log.warn('Demo database is unavailable');
  }
  if (config.APP_MODE === 'beta') {
    try {
      await Promise.all([db!.user.findFirst({ select: { email: true, performanceRevision: true } }), db!.session.findFirst({ select: { id: true } }), db!.verification.findFirst({ select: { id: true } }), db!.account.findFirst({ select: { id: true } }), db!.rateLimit.findFirst({ select: { id: true } }), db!.emailAuthBudget.findFirst({ select: { key: true } })]);
    } catch { throw new Error('Beta requires the B1 database migration; run db:deploy before startup'); }
  }
  app.log.info({ dataSource: store.kind }, 'Starting RunSaturday API');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'Shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : '';
  console.error(message.startsWith('Invalid environment configuration:') || message.startsWith('Beta ') ? message : 'API startup failed. Check the service configuration and database availability.');
  process.exit(1);
});
