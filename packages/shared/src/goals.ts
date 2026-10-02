/**
 * SATURDAY INTENTS (Phase 5B): what a runner is looking for THIS Saturday. One concept: the
 * long-standing goal ids (stored as User.preferredGoal) are the intent ids, so nothing is
 * duplicated and no migration is needed. `surprise` is an app-only intent and is never stored.
 * An intent is a per-Saturday choice, never a permanent "casual" or "performance" label.
 *
 *   intent        constant name used in docs/product language
 *   label         compact label (Home selector)
 *   longLabel     planner / heading label
 *   description   one-line explanation shown when selected
 *   dependencies  data the ranking needs (the UI can say what is missing)
 *   strategy      how the orchestrator ranks for it (server: saturday/orchestrator.ts)
 *   pillar        explore or perform, for visual grouping only
 */
export const GOALS = [
  {
    id: 'pb',
    intent: 'RUN_FASTER',
    label: 'Run faster',
    longLabel: 'Run faster',
    description: 'Find a course that suits a quick 5K.',
    dependencies: ['course_speed_factors', 'pb_score', 'current_form'],
    strategy: 'PB Score (course speed and structure), limited data last; Current Form shown as the equivalent here.',
    pillar: 'perform',
    available: true,
  },
  {
    id: 'place',
    intent: 'HIGH_FINISH',
    label: 'Finish higher',
    longLabel: 'Finish higher',
    description: 'Find events where your Current Form historically places well.',
    dependencies: ['current_form', 'course_speed_factors', 'results'],
    strategy: 'Current Form converted to each course, then the historical placement engine (top-10 share, conservative ties).',
    pillar: 'perform',
    available: true,
  },
  {
    id: 'new_event',
    intent: 'VISIT_NEW_EVENT',
    label: 'Somewhere new',
    longLabel: 'Visit somewhere new',
    description: "Only events you haven't visited.",
    dependencies: ['visits', 'travel'],
    strategy: 'Unvisited events only, reliable data first, then nearest.',
    pillar: 'explore',
    available: true,
  },
  {
    id: 'challenge',
    intent: 'COMPLETE_CHALLENGE',
    label: 'Challenge',
    longLabel: 'Complete a challenge',
    description: 'Find an event that advances one of your challenges.',
    dependencies: ['visits', 'challenges', 'travel'],
    strategy: 'Events that complete a missing challenge item, nearest first.',
    pillar: 'explore',
    available: true,
  },
  {
    id: 'quiet',
    intent: 'QUIET_EVENT',
    label: 'Quiet',
    longLabel: 'Quiet event',
    description: 'Prefer historically smaller fields.',
    dependencies: ['participants'],
    strategy: 'Median field size over the last 90 days; enough events for a reliable figure first.',
    pillar: 'explore',
    available: true,
  },
  {
    id: 'hidden_gem',
    intent: 'HIDDEN_GEM',
    label: 'Hidden gem',
    longLabel: 'Hidden gem',
    description: 'Find less obvious events worth considering.',
    dependencies: ['participants', 'travel', 'visits', 'current_form'],
    strategy: 'Hidden Gem V1 (hidden_gem_v1), exactly as the Hidden Gems tool.',
    pillar: 'explore',
    available: true,
  },
  {
    id: 'surprise',
    intent: 'SURPRISE_ME',
    label: 'Surprise me',
    longLabel: 'Surprise me',
    description: 'An interesting, balanced option.',
    dependencies: ['visits', 'challenges', 'travel', 'participants'],
    strategy: 'Shortlist of reliable events with the most interest signals, rotated deterministically by Saturday.',
    pillar: 'explore',
    available: true,
  },
] as const;

/** Data an intent's ranking relies on. */
export type IntentDependency = (typeof GOALS)[number]['dependencies'][number];

export type Goal = (typeof GOALS)[number]['id'];

export const GOAL_IDS: readonly Goal[] = GOALS.map((g) => g.id);

export function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOAL_IDS as readonly string[]).includes(value);
}

export function goalDefinition(goal: Goal) {
  return GOALS.find((g) => g.id === goal)!;
}

/** Intent constant → intent id (the goal id). */
export const SATURDAY_INTENTS = Object.fromEntries(GOALS.map((g) => [g.intent, g.id])) as { [G in (typeof GOALS)[number] as G['intent']]: G['id'] };

export type SaturdayIntent = keyof typeof SATURDAY_INTENTS;

/** Intents that can be stored as User.preferredGoal (the database enum). `surprise` cannot. */
export type StorableGoal = Exclude<Goal, 'surprise'>;
