import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config/env';
import { createTodayFn, type RequestContext } from './http/context';
import { registerErrorHandling } from './http/errors';
import type { DataStore } from './repositories/DataStore';
import { eventRoutes } from './routes/events';
import { healthRoutes } from './routes/health';
import { plannerRoutes } from './routes/planner';
import { profileRoutes } from './routes/profile';
import { recommendationRoutes } from './routes/recommendations';

export interface BuildAppOptions {
  config: AppConfig;
  store: DataStore;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ config, store, now = () => new Date(), logger }: BuildAppOptions) {
  const app = Fastify({ logger: logger ?? { level: config.LOG_LEVEL } });
  const ctx: RequestContext = { store, config, today: createTodayFn(config, now) };

  await app.register(cors, { origin: config.CORS_ORIGINS, methods: ['GET', 'POST', 'DELETE'] });
  registerErrorHandling(app);

  await healthRoutes(app, ctx);
  await eventRoutes(app, ctx);
  await recommendationRoutes(app, ctx);
  await plannerRoutes(app, ctx);
  await profileRoutes(app, ctx);

  app.addHook('onClose', async () => store.close());
  return app;
}
