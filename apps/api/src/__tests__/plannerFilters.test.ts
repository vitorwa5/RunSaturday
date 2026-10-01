import { DEFAULT_PLANNER_FILTERS, type PlannerFilters } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { matchesFilters } from '../services/plannerFilters';
import { makeEvent } from './helpers';

const f = (overrides: Partial<PlannerFilters>): PlannerFilters => ({ ...DEFAULT_PLANNER_FILTERS, ...overrides });

describe('matchesFilters', () => {
  it('matches everything with default filters', () => {
    expect(matchesFilters(makeEvent({ id: 'a', elevationM: null, laps: null, averageParticipants: null }), DEFAULT_PLANNER_FILTERS)).toBe(true);
  });

  it('filters by surface', () => {
    expect(matchesFilters(makeEvent({ id: 'a', surface: 'trail' }), f({ surface: 'trail' }))).toBe(true);
    expect(matchesFilters(makeEvent({ id: 'a', surface: 'tarmac' }), f({ surface: 'trail' }))).toBe(false);
  });

  it('filters by maximum elevation (exclusive)', () => {
    expect(matchesFilters(makeEvent({ id: 'a', elevationM: 24 }), f({ elevation: 'lt25' }))).toBe(true);
    expect(matchesFilters(makeEvent({ id: 'a', elevationM: 25 }), f({ elevation: 'lt25' }))).toBe(false);
  });

  it.each([
    ['lt100', 99, true],
    ['lt100', 100, false],
    ['200to400', 200, true],
    ['200to400', 400, true],
    ['200to400', 401, false],
    ['gt400', 400, false],
    ['gt400', 414, true],
  ] as const)('participants %s with %i runners → %s', (participants, n, expected) => {
    expect(matchesFilters(makeEvent({ id: 'a', averageParticipants: n }), f({ participants }))).toBe(expected);
  });

  it('filters by visited status', () => {
    expect(matchesFilters(makeEvent({ id: 'a', visited: true }), f({ visited: 'visited' }))).toBe(true);
    expect(matchesFilters(makeEvent({ id: 'a', visited: true }), f({ visited: 'not_visited' }))).toBe(false);
  });

  it('filters by laps', () => {
    expect(matchesFilters(makeEvent({ id: 'a', laps: 3 }), f({ course: '3plus' }))).toBe(true);
    expect(matchesFilters(makeEvent({ id: 'a', laps: 2 }), f({ course: '3plus' }))).toBe(false);
    expect(matchesFilters(makeEvent({ id: 'a', laps: 2 }), f({ course: '2' }))).toBe(true);
  });

  it('filters by minimum confidence', () => {
    const base = makeEvent({ id: 'x' }).scores!;
    const medium = makeEvent({ id: 'm', scores: { ...base, pbConfidence: 'medium' } });
    expect(matchesFilters(medium, f({ confidence: 'medium' }))).toBe(true);
    expect(matchesFilters(medium, f({ confidence: 'high' }))).toBe(false);
    expect(matchesFilters(makeEvent({ id: 'n', scores: null }), f({ confidence: 'medium' }))).toBe(false);
  });

  it('excludes events whose value is unknown when that filter is active (never guesses)', () => {
    const unknown = makeEvent({ id: 'u', elevationM: null, laps: null, averageParticipants: null, visited: undefined });
    expect(matchesFilters(unknown, f({ elevation: 'lt100' }))).toBe(false);
    expect(matchesFilters(unknown, f({ course: '1' }))).toBe(false);
    expect(matchesFilters(unknown, f({ participants: 'lt200' }))).toBe(false);
    expect(matchesFilters(unknown, f({ visited: 'not_visited' }))).toBe(false);
  });
});
