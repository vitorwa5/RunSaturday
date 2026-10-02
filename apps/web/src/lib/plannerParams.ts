/**
 * Saturday selections <-> URL search params. Keeping state in the URL preserves it when the
 * runner opens an event and comes back, makes plans shareable, and lets Home, My Challenges and
 * Explore hand a plan to the Saturday Planner without losing context. Nothing private is put in
 * the URL. Absent or invalid values fall back to defaults (the API resolves intent and travel
 * defaults from the profile). `goal` is still read for links made before Phase 5B.
 */
import {
  DEFAULT_PLANNER_FILTERS,
  isGoal,
  PLANNER_FILTER_KEYS,
  PLANNER_FILTER_OPTIONS,
  TRAVEL_LIMIT_OPTIONS,
  type Goal,
  type PlannerFilters,
} from '@runsaturday/shared';

export interface PlannerSelection {
  date?: string;
  intent?: Goal;
  maxTravel?: number;
  filters: PlannerFilters;
  /** Complete a challenge: which challenge and (optionally) which missing item. */
  challenge?: string;
  item?: string;
  /** Surprise me: which rotation of the shortlist ("show me another"). */
  offset?: number;
}

const SAFE_ID = /^[a-z0-9_-]{1,50}$/i;

export function parsePlannerParams(params: URLSearchParams): PlannerSelection {
  const date = params.get('date');
  const intent = params.get('intent') ?? params.get('goal');
  const travel = Number(params.get('travel'));
  const challenge = params.get('challenge');
  const item = params.get('item');
  const offset = Number(params.get('offset'));
  const filters = { ...DEFAULT_PLANNER_FILTERS };
  for (const key of PLANNER_FILTER_KEYS) {
    const value = params.get(key);
    if (value && PLANNER_FILTER_OPTIONS[key].some((o) => o.id === value)) {
      (filters as Record<string, string>)[key] = value;
    }
  }
  return {
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    ...(isGoal(intent) ? { intent } : {}),
    ...((TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(travel) ? { maxTravel: travel } : {}),
    ...(challenge && SAFE_ID.test(challenge) ? { challenge } : {}),
    ...(item && SAFE_ID.test(item) ? { item: item.toUpperCase() } : {}),
    ...(Number.isInteger(offset) && offset > 0 && offset <= 1000 ? { offset } : {}),
    filters,
  };
}

export function serializePlannerParams(selection: PlannerSelection): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.intent) params.set('intent', selection.intent);
  if (selection.intent === 'challenge' && selection.challenge) params.set('challenge', selection.challenge);
  if (selection.intent === 'challenge' && selection.item) params.set('item', selection.item);
  if (selection.intent === 'surprise' && selection.offset) params.set('offset', String(selection.offset));
  if (selection.date) params.set('date', selection.date);
  if (selection.maxTravel != null) params.set('travel', String(selection.maxTravel));
  for (const key of PLANNER_FILTER_KEYS) {
    if (selection.filters[key] !== 'any') params.set(key, selection.filters[key]);
  }
  return params;
}

/**
 * Switching intent keeps every compatible constraint (date, travel limit, filters) and drops
 * only what belongs to the previous intent (challenge item, surprise rotation).
 */
export function withIntent(selection: PlannerSelection, intent: Goal): PlannerSelection {
  const { item: _item, offset: _offset, ...rest } = selection;
  return { ...rest, intent, ...(intent === 'challenge' && selection.intent === 'challenge' && selection.item ? { item: selection.item } : {}) };
}

/** Query parameters for GET /api/saturday/recommendations. */
export function saturdayApiQuery(selection: PlannerSelection): Record<string, string | number | undefined> {
  return {
    intent: selection.intent,
    date: selection.date,
    maxTravel: selection.maxTravel,
    challenge: selection.intent === 'challenge' ? selection.challenge : undefined,
    item: selection.intent === 'challenge' ? selection.item : undefined,
    offset: selection.intent === 'surprise' && selection.offset ? selection.offset : undefined,
    ...selection.filters,
  };
}

/** Link to the Saturday Planner for a selection. */
export const saturdayLink = (selection: PlannerSelection) => {
  const q = serializePlannerParams(selection).toString();
  return q ? `/saturday?${q}` : '/saturday';
};
