import { calendarDateIn } from '@runsaturday/shared';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import { createPrismaClient } from './db/prisma';
import type { DataStore } from './repositories/DataStore';
import { MemoryDataStore } from './repositories/memory/MemoryDataStore';
import { PrismaDataStore } from './repositories/prisma/PrismaDataStore';

async function main() {
  const config = loadConfig();
  const store: DataStore =
    config.DATA_SOURCE === 'demo'
      ? new MemoryDataStore(calendarDateIn(new Date(), config.APP_TIME_ZONE))
      : new PrismaDataStore(createPrismaClient(config.DATABASE_URL!), config.ACTIVE_SCORE_VERSION);

  const app = await buildApp({ config, store });

  if (store.kind === 'database' && !(await store.ping())) {
    app.log.warn('Database is not reachable. Start it with `npm run db:up`, or run with DATA_SOURCE=demo.');
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
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
