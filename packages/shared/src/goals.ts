/** Saturday objectives a runner can choose. Order is the display order in the goal selector. */
export const GOALS = [
  { id: 'pb', label: 'PB', description: 'Run your fastest 5K' },
  { id: 'place', label: 'Place', description: 'Finish as high as possible' },
  { id: 'hidden_gem', label: 'Hidden Gem', description: 'Discover an under-the-radar event' },
  { id: 'new_event', label: 'New Event', description: 'Visit somewhere you have not run' },
  { id: 'quiet', label: 'Quiet', description: 'A smaller, calmer field' },
  { id: 'challenge', label: 'Challenge', description: 'Progress a running challenge' },
] as const;

export type Goal = (typeof GOALS)[number]['id'];

export const GOAL_IDS: readonly Goal[] = GOALS.map((g) => g.id);

export function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOAL_IDS as readonly string[]).includes(value);
}
