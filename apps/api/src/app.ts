import { installIdentity, accountRoutes, type AuthRuntime } from './auth/http';
import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config/env';
import { trustedProxyAddresses } from './config/proxy';
import { createTodayFn, type RequestContext } from './http/context';
import { registerErrorHandling } from './http/errors';
import type { DataStore } from './repositories/DataStore';
import { analyticsRoutes } from './routes/analytics';
import { eventRoutes } from './routes/events';
import { healthRoutes } from './routes/health';
import { toolRoutes } from './routes/tools';
import { profileRoutes } from './routes/profile';
import { challengeRoutes } from './routes/challenges';
import { saturdayRoutes } from './routes/saturday';

export interface BuildAppOptions {
  authRuntime?: AuthRuntime;
  config: AppConfig;
  store: DataStore;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ config, store, now = () => new Date(), logger, authRuntime }: BuildAppOptions) {
  const proxies = trustedProxyAddresses(config.TRUSTED_PROXY_CIDRS);
  const app = Fastify({ trustProxy: proxies.length ? proxies : false, logger: logger ?? {
    level: config.LOG_LEVEL,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    serializers: { req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url.split('?')[0] }) },
  } });
  const ctx: RequestContext = { store, config, today: createTodayFn(config, now) };

  installIdentity(app, ctx, authRuntime);
  await app.register(cors, { origin: config.CORS_ORIGINS, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  registerErrorHandling(app);

  await accountRoutes(app, ctx, authRuntime);
  await healthRoutes(app, ctx);
  await eventRoutes(app, ctx);
  await saturdayRoutes(app, ctx);
  await toolRoutes(app, ctx);
  await analyticsRoutes(app, ctx);
  await profileRoutes(app, ctx);
  await challengeRoutes(app, ctx);

  app.addHook('onClose', async () => store.close());
  return app;
}
