import { describe, expect, it } from 'vitest';
import { GOALS, isGoal, SATURDAY_INTENTS } from '../goals';

describe('Saturday intents (goals)', () => {
  it('lists the seven intents in display order, each with a label and a one-line explanation', () => {
    expect(GOALS.map((g) => g.label)).toEqual(['Run faster', 'Finish higher', 'Somewhere new', 'Challenge', 'Quiet', 'Hidden gem', 'Surprise me']);
    expect(GOALS.map((g) => g.longLabel)).toEqual(['Run faster', 'Finish higher', 'Visit somewhere new', 'Complete a challenge', 'Quiet event', 'Hidden gem', 'Surprise me']);
    for (const g of GOALS) {
      expect(g.description.length, g.id).toBeGreaterThan(10);
      expect(g.strategy.length, g.id).toBeGreaterThan(10);
      expect(g.dependencies.length, g.id).toBeGreaterThan(0);
    }
    expect(GOALS.every((g) => g.available)).toBe(true);
  });

  it('keeps the stored goal ids and maps every intent constant onto one (no second concept)', () => {
    expect(SATURDAY_INTENTS).toEqual({
      RUN_FASTER: 'pb',
      HIGH_FINISH: 'place',
      VISIT_NEW_EVENT: 'new_event',
      COMPLETE_CHALLENGE: 'challenge',
      QUIET_EVENT: 'quiet',
      HIDDEN_GEM: 'hidden_gem',
      SURPRISE_ME: 'surprise',
    });
    expect(GOALS.filter((g) => g.pillar === 'perform').map((g) => g.id)).toEqual(['pb', 'place']);
  });

  it('validates intent ids', () => {
    expect(isGoal('pb')).toBe(true);
    expect(isGoal('surprise')).toBe(true);
    expect(isGoal('PB')).toBe(false);
    expect(isGoal('RUN_FASTER')).toBe(false);
    expect(isGoal(undefined)).toBe(false);
  });
});
