import { describe, expect, it } from 'vitest';
import { GOALS, isGoal } from '../goals';

describe('goals', () => {
  it('lists the six Saturday objectives in display order', () => {
    expect(GOALS.map((g) => g.label)).toEqual(['PB', 'Place', 'Hidden Gem', 'New Event', 'Quiet', 'Challenge']);
  });

  it('has a long Planner label for every goal and marks Challenge unavailable', () => {
    expect(GOALS.map((g) => g.longLabel)).toEqual(['PB', 'High Finish', 'Hidden Gem', 'New Event', 'Quiet', 'Challenge']);
    expect(GOALS.filter((g) => !g.available).map((g) => g.id)).toEqual(['challenge']);
  });

  it('validates goal ids', () => {
    expect(isGoal('pb')).toBe(true);
    expect(isGoal('hidden_gem')).toBe(true);
    expect(isGoal('PB')).toBe(false);
    expect(isGoal(undefined)).toBe(false);
  });
});
