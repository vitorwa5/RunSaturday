/**
 * Saturday Planner options shared by the API (validation) and the client (controls).
 * Only properties that exist in the data model are filterable; nothing is inferred.
 */

export const TRAVEL_LIMIT_OPTIONS = [15, 30, 45, 60, 90] as const;

/** How many upcoming Saturdays can be planned. */
export const PLANNER_SATURDAYS = 4;

export const SURFACE_FILTERS = [
  { id: 'any', label: 'Any' },
  { id: 'tarmac', label: 'Tarmac' },
  { id: 'trail', label: 'Trail' },
  { id: 'grass', label: 'Grass' },
  { id: 'mixed', label: 'Mixed' },
] as const;

/** Maximum total elevation, exclusive. */
export const ELEVATION_FILTERS = [
  { id: 'any', label: 'Any', maxM: null },
  { id: 'lt25', label: '< 25 m', maxM: 25 },
  { id: 'lt50', label: '< 50 m', maxM: 50 },
  { id: 'lt100', label: '< 100 m', maxM: 100 },
] as const;

/** Average participants: min inclusive, max exclusive ("200–400" includes 400). */
export const PARTICIPANT_FILTERS = [
  { id: 'any', label: 'Any', min: null, max: null },
  { id: 'lt100', label: '< 100', min: null, max: 100 },
  { id: 'lt200', label: '< 200', min: null, max: 200 },
  { id: '200to400', label: '200–400', min: 200, max: 401 },
  { id: 'gt400', label: '> 400', min: 401, max: null },
] as const;

export const VISITED_FILTERS = [
  { id: 'any', label: 'Any' },
  { id: 'not_visited', label: 'Not visited' },
  { id: 'visited', label: 'Visited' },
] as const;

/** Number of laps. Out-and-back and point-to-point courses count as 1 lap. */
export const COURSE_FILTERS = [
  { id: 'any', label: 'Any', minLaps: null, maxLaps: null },
  { id: '1', label: '1 lap', minLaps: 1, maxLaps: 1 },
  { id: '2', label: '2 laps', minLaps: 2, maxLaps: 2 },
  { id: '3plus', label: '3+ laps', minLaps: 3, maxLaps: null },
] as const;

export const CONFIDENCE_FILTERS = [
  { id: 'any', label: 'Any' },
  { id: 'medium', label: 'Medium+' },
  { id: 'high', label: 'High' },
] as const;

type Ids<T extends readonly { id: string }[]> = T[number]['id'];

export interface PlannerFilters {
  surface: Ids<typeof SURFACE_FILTERS>;
  elevation: Ids<typeof ELEVATION_FILTERS>;
  participants: Ids<typeof PARTICIPANT_FILTERS>;
  visited: Ids<typeof VISITED_FILTERS>;
  course: Ids<typeof COURSE_FILTERS>;
  confidence: Ids<typeof CONFIDENCE_FILTERS>;
}

export const DEFAULT_PLANNER_FILTERS: PlannerFilters = {
  surface: 'any',
  elevation: 'any',
  participants: 'any',
  visited: 'any',
  course: 'any',
  confidence: 'any',
};

export const PLANNER_FILTER_OPTIONS = {
  surface: SURFACE_FILTERS,
  elevation: ELEVATION_FILTERS,
  participants: PARTICIPANT_FILTERS,
  visited: VISITED_FILTERS,
  course: COURSE_FILTERS,
  confidence: CONFIDENCE_FILTERS,
} as const;

export const PLANNER_FILTER_KEYS = Object.keys(DEFAULT_PLANNER_FILTERS) as (keyof PlannerFilters)[];

export function activeFilterCount(filters: PlannerFilters): number {
  return PLANNER_FILTER_KEYS.filter((k) => filters[k] !== 'any').length;
}

/** Event history windows. `days: null` = all available history. */
export const HISTORY_WINDOWS = [
  { id: '30', label: '30d', days: 30 },
  { id: '60', label: '60d', days: 60 },
  { id: '90', label: '90d', days: 90 },
  { id: '365', label: '1y', days: 365 },
  { id: 'all', label: 'All', days: null },
] as const;

export type HistoryWindowId = (typeof HISTORY_WINDOWS)[number]['id'];
export const DEFAULT_HISTORY_WINDOW: HistoryWindowId = '90';
