/**
 * Explore & Challenges API (Phase 5A). Read-only: challenge progress is always derived on the
 * server from canonical performances and the event dataset; clients cannot submit completion.
 */
import type { ChallengeOpportunitiesResponse, ChallengeResult, ChallengesResponse, EventVisitSummary, ExploreSummary } from '@runsaturday/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eventsMatching, findChallenge, isChallengeItem, itemRef } from '../challenges/engine';
import { currentUserId, currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { AppError, notFound, parseInput } from '../http/errors';
import { withContext } from '../services/eventContext';
import { eventVisitSummary, exploreSummary, loadExploreState } from '../services/explore';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const ItemQuery = z.object({ item: z.string().trim().min(1).max(50) });

export async function challengeRoutes(app: FastifyInstance, ctx: RequestContext) {
  const state = async () => {
    if (!(await ctx.store.getUser(currentUserId(ctx)))) throw notFound('Your profile');
    return loadExploreState(ctx.store, currentUserId(ctx), ctx.today());
  };
  const challengeOr404 = (id: string) => {
    const def = findChallenge(id);
    if (!def) throw notFound('This challenge');
    return def;
  };

  app.get('/api/profile/explore-summary', async (): Promise<ExploreSummary> => exploreSummary(await state()));

  app.get('/api/profile/challenges', async (): Promise<ChallengesResponse> => {
    const s = await state();
    return { asOfDate: s.history.asOfDate, challenges: s.challenges };
  });

  app.get('/api/profile/challenges/:id', async (request): Promise<ChallengeResult> => {
    const def = challengeOr404(parseInput(IdParams, request.params).id);
    return (await state()).challenges.find((c) => c.id === def.id)!;
  });

  /** Events that would complete one item: Explore's generic challenge filter. */
  app.get('/api/profile/challenges/:id/opportunities', async (request): Promise<ChallengeOpportunitiesResponse> => {
    const def = challengeOr404(parseInput(IdParams, request.params).id);
    const item = parseInput(ItemQuery, request.query).item.toUpperCase();
    if (!isChallengeItem(def, item)) throw new AppError(400, 'unknown_challenge_item', `${item} is not part of the ${def.name}.`);
    const s = await state();
    const user = await currentUser(ctx);
    const matching = eventsMatching(def, item, s.context.events).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      item: itemRef(def, item),
      completed: s.challenges.find((c) => c.id === def.id)!.completedItems.includes(item),
      events: withContext(matching, resolveOrigin({}, user), user),
    };
  });

  app.get('/api/profile/events/:id/visits', async (request): Promise<EventVisitSummary> => {
    const { id } = parseInput(IdParams, request.params);
    const eventId = await ctx.store.findEventId(id);
    if (!eventId) throw notFound('This event');
    const s = await state();
    const event = s.context.events.find((e) => e.id === eventId) ?? (await ctx.store.getEvent(eventId, ctx.today()))!;
    return eventVisitSummary(s, event);
  });
}
