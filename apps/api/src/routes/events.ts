import type { FastifyInstance } from 'fastify';
import type { EventDetail, EventSummary } from '@runsaturday/shared';
import { z } from 'zod';
import { currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { notFound, parseInput } from '../http/errors';
import { MaxTravel, OriginQuery } from '../http/schemas';
import { nearest, withContext } from '../services/eventContext';

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const NearbyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
  maxTravel: MaxTravel,
});

const IdParams = z.object({ id: z.string().min(1).max(200) });

export async function eventRoutes(app: FastifyInstance, ctx: RequestContext) {
  app.get('/api/events', async (request): Promise<EventSummary[]> => {
    const origin = parseInput(OriginQuery, request.query);
    const user = await currentUser(ctx);
    return withContext(await ctx.store.listActiveEvents(), resolveOrigin(origin, user), user);
  });

  app.get('/api/events/search', async (request): Promise<EventSummary[]> => {
    const { q, limit } = parseInput(SearchQuery, request.query);
    const user = await currentUser(ctx);
    return withContext(await ctx.store.searchEvents(q, limit), resolveOrigin({}, user), user);
  });

  app.get('/api/events/nearby', async (request): Promise<EventSummary[]> => {
    const origin = parseInput(OriginQuery, request.query);
    const { limit, maxTravel } = parseInput(NearbyQuery, request.query);
    const user = await currentUser(ctx);
    const events = withContext(await ctx.store.listActiveEvents(), resolveOrigin(origin, user), user);
    return nearest(events, maxTravel ?? null, limit);
  });

  app.get('/api/events/:id', async (request): Promise<EventDetail> => {
    const { id } = parseInput(IdParams, request.params);
    const event = await ctx.store.getEvent(id, ctx.today());
    if (!event) throw notFound('This event');
    const user = await currentUser(ctx);
    const [withExtras] = withContext([event], resolveOrigin({}, user), user);
    return { ...event, ...withExtras };
  });
}
