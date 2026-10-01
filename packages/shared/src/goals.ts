/**
 * Saturday objectives a runner can choose. Order is the display order in goal selectors.
 * `label` is the compact Home label; `longLabel` is used where there is more room (Planner).
 * `available` is false where the app cannot yet make an honest recommendation.
 */
export const GOALS = [
  { id: 'pb', label: 'PB', longLabel: 'PB', description: 'Run your fastest 5K', available: true },
  { id: 'place', label: 'Place', longLabel: 'High Finish', description: 'Finish as high as possible', available: true },
  { id: 'hidden_gem', label: 'Hidden Gem', longLabel: 'Hidden Gem', description: 'Discover an under-the-radar event', available: true },
  { id: 'new_event', label: 'New Event', longLabel: 'New Event', description: 'Visit somewhere you have not run', available: true },
  { id: 'quiet', label: 'Quiet', longLabel: 'Quiet', description: 'A smaller, calmer field', available: true },
  { id: 'challenge', label: 'Challenge', longLabel: 'Challenge', description: 'Progress a running challenge', available: false },
] as const;

export type Goal = (typeof GOALS)[number]['id'];

export const GOAL_IDS: readonly Goal[] = GOALS.map((g) => g.id);

export function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOAL_IDS as readonly string[]).includes(value);
}

export function goalDefinition(goal: Goal) {
  return GOALS.find((g) => g.id === goal)!;
}
