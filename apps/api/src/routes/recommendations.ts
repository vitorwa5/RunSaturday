import type { FastifyInstance } from 'fastify';
import type { BestPickResponse, Goal } from '@runsaturday/shared';
import { z } from 'zod';
import { currentUser, resolveOrigin, upcomingSaturday, type RequestContext } from '../http/context';
import { parseInput } from '../http/errors';
import { GoalParam, MaxTravel, OriginQuery } from '../http/schemas';
import { withContext } from '../services/eventContext';
import { rankingContext } from '../services/rankingContext';
import { bestPick } from '../services/recommendations';

const BestPickQuery = z.object({
  goal: GoalParam.default('pb'),
  maxTravel: MaxTravel,
});

export async function recommendationRoutes(app: FastifyInstance, ctx: RequestContext) {
  app.get('/api/recommendations/best-pick', async (request): Promise<BestPickResponse> => {
    const origin = parseInput(OriginQuery, request.query);
    const { goal, maxTravel } = parseInput(BestPickQuery, request.query);
    const user = await currentUser(ctx);
    const events = withContext(await ctx.store.listActiveEvents(), resolveOrigin(origin, user), user);
    const maxTravelMinutes = maxTravel ?? user?.defaultTravelMinutes ?? null;
    // High Finish and Hidden Gem use Current Form (same inputs as the planner); other goals do not.
    const context =
      maxTravelMinutes != null ? await rankingContext(ctx.store, user, goal as Goal, events, { maxTravelMinutes, today: ctx.today() }) : undefined;
    return bestPick(goal as Goal, events, { date: upcomingSaturday(ctx), maxTravelMinutes, context });
  });
}
