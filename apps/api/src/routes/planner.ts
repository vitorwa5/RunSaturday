import type { FastifyInstance } from 'fastify';
import {
  formatFinishTime,
  CONFIDENCE_FILTERS,
  COURSE_FILTERS,
  ELEVATION_FILTERS,
  PARTICIPANT_FILTERS,
  PLANNER_SATURDAYS,
  SURFACE_FILTERS,
  TRAVEL_LIMIT_OPTIONS,
  upcomingSaturdays,
  VISITED_FILTERS,
  type Goal,
  type PlannerResponse,
} from '@runsaturday/shared';
import { z } from 'zod';
import { currentUser, resolveOrigin, type RequestContext } from '../http/context';
import { AppError, parseInput } from '../http/errors';
import { GoalParam, OriginQuery } from '../http/schemas';
import { withContext } from '../services/eventContext';
import { formReferenceOf, formUnavailableNote } from '../services/runnerForm';
import { matchesFilters } from '../services/plannerFilters';
import { rankEvents } from '../services/recommendations';

const ids = <T extends readonly { id: string }[]>(options: T) => options.map((o) => o.id) as [T[number]['id'], ...T[number]['id'][]];

const PlannerQuery = z.object({
  goal: GoalParam.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxTravel: z.coerce.number().int().refine((n) => (TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(n)).optional(),
  surface: z.enum(ids(SURFACE_FILTERS)).default('any'),
  elevation: z.enum(ids(ELEVATION_FILTERS)).default('any'),
  participants: z.enum(ids(PARTICIPANT_FILTERS)).default('any'),
  visited: z.enum(ids(VISITED_FILTERS)).default('any'),
  course: z.enum(ids(COURSE_FILTERS)).default('any'),
  confidence: z.enum(ids(CONFIDENCE_FILTERS)).default('any'),
});

const FALLBACK_TRAVEL_MINUTES = 45;

export async function plannerRoutes(app: FastifyInstance, ctx: RequestContext) {
  app.get('/api/planner', async (request): Promise<PlannerResponse> => {
    const originQuery = parseInput(OriginQuery, request.query);
    const { goal: goalParam, date: dateParam, maxTravel: travelParam, ...filters } = parseInput(PlannerQuery, request.query);

    const availableDates = upcomingSaturdays(ctx.today(), PLANNER_SATURDAYS);
    const date = dateParam ?? availableDates[0]!;
    if (!availableDates.includes(date)) {
      throw new AppError(400, 'unsupported_date', `Planning is available for the next ${PLANNER_SATURDAYS} Saturdays only.`);
    }

    const user = await currentUser(ctx);
    const goal = (goalParam ?? user?.preferredGoal ?? 'pb') as Goal;
    const maxTravelMinutes = travelParam ?? user?.defaultTravelMinutes ?? FALLBACK_TRAVEL_MINUTES;
    const originCoords = resolveOrigin(originQuery, user);
    const origin = !originCoords
      ? null
      : originQuery.lat != null
        ? { label: 'Chosen location', source: 'coordinates' as const }
        : { label: user?.homeLabel ?? 'Home', source: 'home' as const };

    const events = withContext(await ctx.store.listActiveEvents(), originCoords, user);
    const withinTravel = events.filter((e) => e.travel && e.travel.minutes <= maxTravelMinutes);
    const matching = withinTravel.filter((e) => matchesFilters(e, filters));
    const ranking = rankEvents(goal, matching, maxTravelMinutes);

    let message: string | undefined;
    if (!origin) message = 'Choose a starting point to see events near you.';
    else if (ranking.unavailableMessage) message = ranking.unavailableMessage;
    else if (withinTravel.length === 0) message = `No events within ${maxTravelMinutes} minutes. Try a longer travel limit.`;
    else if (matching.length === 0) message = 'No events match these filters.';
    else if (ranking.results.length === 0) message = 'No events suit this goal with the current settings.';

    // Personalised ability reference: Current Form only. An old Overall 5K PB is never used as
    // current ability; when there is no Current Form the response says so.
    const formReference = user ? formReferenceOf(user.currentForm) : null;
    const ability = {
      formReference,
      note: formReference
        ? `Your personalised reference is your Current Form ≈ ${formatFinishTime(formReference.formSeconds)} (${formReference.confidence} confidence), a course-neutral estimate of present ability. Event rankings here use course and event data; see Where Could I Place? for how it would place.`
        : `${user ? formUnavailableNote(user.currentForm) : 'Current Form unavailable.'} Your Overall 5K PB is not used as current ability.`,
    };

    return {
      ability,
      date,
      availableDates,
      goal,
      origin,
      maxTravelMinutes,
      filters,
      method: ranking.method,
      results: origin ? ranking.results : [],
      counts: { total: events.length, withinTravel: withinTravel.length, matchingFilters: matching.length },
      ...(message ? { message } : {}),
      notes: [
        'Rankings use historical data only. They do not yet change with the date, weather or cancellations.',
        'Travel times are estimates from straight-line distance, not driving directions.',
      ],
    };
  });
}
