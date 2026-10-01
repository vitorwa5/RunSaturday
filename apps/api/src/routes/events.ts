import type { FastifyInstance } from 'fastify';
import { DEFAULT_HISTORY_WINDOW, HISTORY_WINDOWS, type EventDetail, type EventHistoryResponse, type EventSummary } from '@runsaturday/shared';
import { z } from 'zod';
import { currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { notFound, parseInput } from '../http/errors';
import { MaxTravel, OriginQuery } from '../http/schemas';
import { nearest, withContext } from '../services/eventContext';
import { buildEventHistory } from '../services/eventHistory';

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const NearbyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
  maxTravel: MaxTravel,
});

const IdParams = z.object({ id: z.string().min(1).max(200) });

const HistoryQuery = z.object({
  window: z.enum(HISTORY_WINDOWS.map((w) => w.id) as [string, ...string[]]).default(DEFAULT_HISTORY_WINDOW),
});

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

  app.get('/api/events/:id/history', async (request): Promise<EventHistoryResponse> => {
    const { id } = parseInput(IdParams, request.params);
    const { window } = parseInput(HistoryQuery, request.query);
    const eventId = await ctx.store.findEventId(id);
    if (!eventId) throw notFound('This event');
    return buildEventHistory(eventId, await ctx.store.listOccurrences(eventId), window as EventHistoryResponse['window'], ctx.today());
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
