/** Options for the discovery and performance tools, shared by the API and the client. */

/** Historical placement targets. Position targets compare against a fixed place; percent targets against the field. */
export const PLACEMENT_TARGETS = [
  { id: 'podium', label: 'Podium', short: 'Top 3', kind: 'position', value: 3 },
  { id: 'top5', label: 'Top 5', short: 'Top 5', kind: 'position', value: 5 },
  { id: 'top10', label: 'Top 10', short: 'Top 10', kind: 'position', value: 10 },
  { id: 'top10pct', label: 'Top 10%', short: 'Top 10%', kind: 'percent', value: 0.1 },
  { id: 'top25pct', label: 'Top 25%', short: 'Top 25%', kind: 'percent', value: 0.25 },
] as const;

export type PlacementTargetId = (typeof PLACEMENT_TARGETS)[number]['id'];
export const DEFAULT_PLACEMENT_TARGET: PlacementTargetId = 'top10';

export const PB_FINDER_SORTS = [
  { id: 'pb', label: 'PB Score' },
  { id: 'travel', label: 'Travel' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'difficulty', label: 'Difficulty' },
] as const;

export type PbFinderSortId = (typeof PB_FINDER_SORTS)[number]['id'];

export const HIDDEN_GEM_MODES = [
  { id: 'all', label: 'All gems', description: 'Every event, ranked by Gem Score' },
  { id: 'quiet', label: 'Quiet', description: 'Fewer than 200 runners on average' },
  { id: 'easier_to_place', label: 'Easier to place', description: 'Strong placement opportunity (50+)' },
  { id: 'fast', label: 'Fast', description: 'PB Score of 80 or more' },
  { id: 'small_field', label: 'Small field', description: 'Fewer than 120 runners on average' },
  { id: 'not_visited', label: 'Not visited', description: "Events you haven't run" },
] as const;

export type HiddenGemModeId = (typeof HIDDEN_GEM_MODES)[number]['id'];

export const HIDDEN_GEM_ALGORITHM = 'hidden_gem_v1';

export const COMPARE_MIN_EVENTS = 2;
export const COMPARE_MAX_EVENTS = 4;

/** Where a runner time came from. */
export const RUNNER_TIME_SOURCES = [
  { id: 'current', label: 'Current form (estimate)' },
  { id: 'recent', label: 'Recent best' },
  { id: 'pb', label: 'Overall 5K PB' },
  { id: 'manual', label: 'Enter a time' },
] as const;

export type RunnerTimeSourceId = (typeof RUNNER_TIME_SOURCES)[number]['id'];

/** "1st", "2nd", "3rd", "11th", "22nd"… */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
