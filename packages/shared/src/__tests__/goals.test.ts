import { describe, expect, it } from 'vitest';
import { GOALS, isGoal } from '../goals';

describe('goals', () => {
  it('lists the six Saturday objectives in display order', () => {
    expect(GOALS.map((g) => g.label)).toEqual(['PB', 'Place', 'Hidden Gem', 'New Event', 'Quiet', 'Challenge']);
  });

  it('validates goal ids', () => {
    expect(isGoal('pb')).toBe(true);
    expect(isGoal('hidden_gem')).toBe(true);
    expect(isGoal('PB')).toBe(false);
    expect(isGoal(undefined)).toBe(false);
  });
});
