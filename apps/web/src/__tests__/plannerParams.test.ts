import { DEFAULT_PLANNER_FILTERS } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { parsePlannerParams, plannerApiQuery, serializePlannerParams } from '../lib/plannerParams';

describe('planner URL params', () => {
  it('parses an empty query to defaults', () => {
    expect(parsePlannerParams(new URLSearchParams())).toEqual({ filters: DEFAULT_PLANNER_FILTERS });
  });

  it('round-trips a full selection', () => {
    const selection = {
      date: '2026-10-10',
      goal: 'quiet' as const,
      maxTravel: 30,
      filters: { ...DEFAULT_PLANNER_FILTERS, surface: 'trail' as const, confidence: 'high' as const },
    };
    const params = serializePlannerParams(selection);
    expect(params.toString()).toBe('date=2026-10-10&goal=quiet&travel=30&surface=trail&confidence=high');
    expect(parsePlannerParams(params)).toEqual(selection);
  });

  it('ignores invalid values instead of passing them on', () => {
    const parsed = parsePlannerParams(new URLSearchParams('goal=fastest&travel=20&surface=sand&date=tomorrow&course=3plus'));
    expect(parsed).toEqual({ filters: { ...DEFAULT_PLANNER_FILTERS, course: '3plus' } });
  });

  it('builds the API query', () => {
    const q = plannerApiQuery({ goal: 'pb', maxTravel: 45, filters: DEFAULT_PLANNER_FILTERS });
    expect(q).toMatchObject({ goal: 'pb', maxTravel: 45, surface: 'any', date: undefined });
  });
});
