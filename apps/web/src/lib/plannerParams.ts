/**
 * Saturday Planner selections <-> URL search params. Keeping state in the URL preserves it
 * when the runner opens an event and comes back, and makes plans shareable.
 * Values that are absent or invalid fall back to defaults (the API resolves goal/travel
 * defaults from the profile).
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
  goal?: Goal;
  maxTravel?: number;
  filters: PlannerFilters;
}

export function parsePlannerParams(params: URLSearchParams): PlannerSelection {
  const date = params.get('date');
  const goal = params.get('goal');
  const travel = Number(params.get('travel'));
  const filters = { ...DEFAULT_PLANNER_FILTERS };
  for (const key of PLANNER_FILTER_KEYS) {
    const value = params.get(key);
    if (value && PLANNER_FILTER_OPTIONS[key].some((o) => o.id === value)) {
      (filters as Record<string, string>)[key] = value;
    }
  }
  return {
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    ...(isGoal(goal) ? { goal } : {}),
    ...((TRAVEL_LIMIT_OPTIONS as readonly number[]).includes(travel) ? { maxTravel: travel } : {}),
    filters,
  };
}

export function serializePlannerParams(selection: PlannerSelection): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.date) params.set('date', selection.date);
  if (selection.goal) params.set('goal', selection.goal);
  if (selection.maxTravel != null) params.set('travel', String(selection.maxTravel));
  for (const key of PLANNER_FILTER_KEYS) {
    if (selection.filters[key] !== 'any') params.set(key, selection.filters[key]);
  }
  return params;
}

/** Query parameters for GET /api/planner. */
export function plannerApiQuery(selection: PlannerSelection): Record<string, string | number | undefined> {
  return { date: selection.date, goal: selection.goal, maxTravel: selection.maxTravel, ...selection.filters };
}
