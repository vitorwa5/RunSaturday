import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@runsaturday/shared';
import type { RequestContext } from '../http/context';

export const API_VERSION = '0.1.0';

export async function healthRoutes(app: FastifyInstance, ctx: RequestContext) {
  app.get('/api/health', async (_request, reply): Promise<HealthResponse> => {
    const reachable = await ctx.store.ping();
    const database = ctx.store.kind === 'database' ? (reachable ? 'ok' : 'unavailable') : 'not_used';
    if (!reachable) reply.status(503);
    return { status: reachable ? 'ok' : 'degraded', dataSource: ctx.store.kind, database, version: API_VERSION };
  });
}
