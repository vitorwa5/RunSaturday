import { DEFAULT_PLANNER_FILTERS } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { parsePlannerParams, saturdayApiQuery, saturdayLink, serializePlannerParams, withIntent } from '../lib/plannerParams';

describe('Saturday URL params', () => {
  it('parses an empty query to defaults', () => {
    expect(parsePlannerParams(new URLSearchParams())).toEqual({ filters: DEFAULT_PLANNER_FILTERS });
  });

  it('round-trips a full selection', () => {
    const selection = {
      intent: 'quiet' as const,
      date: '2026-10-10',
      maxTravel: 30,
      filters: { ...DEFAULT_PLANNER_FILTERS, surface: 'trail' as const, confidence: 'high' as const },
    };
    const params = serializePlannerParams(selection);
    expect(params.toString()).toBe('intent=quiet&date=2026-10-10&travel=30&surface=trail&confidence=high');
    expect(parsePlannerParams(params)).toEqual(selection);
  });

  it('keeps challenge context in the URL, for the challenge intent only', () => {
    const params = new URLSearchParams('intent=challenge&challenge=alphabet&item=h&travel=45');
    const parsed = parsePlannerParams(params);
    expect(parsed).toMatchObject({ intent: 'challenge', challenge: 'alphabet', item: 'H', maxTravel: 45 });
    expect(saturdayLink(parsed)).toBe('/saturday?intent=challenge&challenge=alphabet&item=H&travel=45');
    expect(serializePlannerParams({ ...parsed, intent: 'pb' }).toString()).toBe('intent=pb&travel=45');
  });

  it('still reads the pre-Phase 5B goal parameter', () => {
    expect(parsePlannerParams(new URLSearchParams('goal=new_event')).intent).toBe('new_event');
  });

  it('ignores invalid values instead of passing them on', () => {
    const parsed = parsePlannerParams(new URLSearchParams('intent=fastest&travel=20&surface=sand&date=tomorrow&course=3plus&item=<x>&offset=-2'));
    expect(parsed).toEqual({ filters: { ...DEFAULT_PLANNER_FILTERS, course: '3plus' } });
  });

  it('switching intent keeps compatible constraints and drops intent-specific state', () => {
    const start = { intent: 'challenge' as const, challenge: 'alphabet', item: 'H', maxTravel: 45, date: '2026-10-10', filters: { ...DEFAULT_PLANNER_FILTERS, surface: 'trail' as const } };
    const faster = withIntent(start, 'pb');
    expect(faster).toEqual({ intent: 'pb', challenge: 'alphabet', maxTravel: 45, date: '2026-10-10', filters: start.filters });
    expect(withIntent({ ...start, intent: 'surprise', offset: 3 }, 'quiet').offset).toBeUndefined();
    // Back to the challenge: the challenge is remembered, the old item is not resurrected.
    expect(withIntent(faster, 'challenge')).toMatchObject({ intent: 'challenge', challenge: 'alphabet', maxTravel: 45 });
    expect(withIntent(faster, 'challenge').item).toBeUndefined();
  });

  it('builds the orchestrator API query', () => {
    expect(saturdayApiQuery({ intent: 'pb', maxTravel: 45, filters: DEFAULT_PLANNER_FILTERS })).toMatchObject({ intent: 'pb', maxTravel: 45, surface: 'any', date: undefined, item: undefined });
    expect(saturdayApiQuery({ intent: 'surprise', offset: 2, filters: DEFAULT_PLANNER_FILTERS }).offset).toBe(2);
    expect(saturdayApiQuery({ intent: 'challenge', challenge: 'alphabet', item: 'C', filters: DEFAULT_PLANNER_FILTERS })).toMatchObject({ challenge: 'alphabet', item: 'C' });
  });
});
