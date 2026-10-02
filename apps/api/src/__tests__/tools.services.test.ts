import { DEFAULT_PLANNER_FILTERS, HIDDEN_GEM_ALGORITHM, type EventPlacement } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { bestByMetric } from '../services/comparisonService';
import { gemComponents, gemScore, HIDDEN_GEM_V1_WEIGHTS, rankHiddenGems } from '../services/hiddenGemService';
import { pbFinder } from '../services/pbFinderService';
import { buildEventPlacement, rankPlacements } from '../services/placementService';
import { makeEvent } from './helpers';

const scores = makeEvent({ id: 'x' }).scores!;
const travel = (minutes: number) => ({ distanceKm: minutes / 2, minutes, method: 'straight_line_estimate' as const });
const noFilters = { surface: DEFAULT_PLANNER_FILTERS.surface, elevation: 'any' as const, confidence: 'any' as const, visited: 'any' as const };

describe('pbFinder', () => {
  const events = [
    makeEvent({ id: 'fast', elevationM: 10, travel: travel(30), scores: { ...scores, pbScore: 92, difficultyScore: 2 } }),
    makeEvent({ id: 'near', elevationM: 60, surface: 'trail', travel: travel(10), scores: { ...scores, pbScore: 60, difficultyScore: 6 } }),
    makeEvent({ id: 'new', elevationM: 5, travel: travel(20), scores: { ...scores, pbScore: 99, difficultyScore: 1, pbConfidence: 'insufficient', sampleSize: 2 } }),
    makeEvent({ id: 'far', travel: travel(80), scores: { ...scores, pbScore: 95 } }),
  ];

  it('sorts by PB Score, keeping limited-data events last, within the travel limit', () => {
    const { results, counts } = pbFinder(events, { maxTravelMinutes: 45, filters: noFilters, sort: 'pb' });
    expect(results.map((r) => r.event.id)).toEqual(['fast', 'near', 'new']);
    expect(results.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(counts).toEqual({ total: 4, withinTravel: 3, matching: 3 });
    expect(results[0]!.rankedBy).toMatchObject({ key: 'pb_score', value: 92 });
  });

  it.each([
    ['travel', ['near', 'new', 'fast']],
    ['elevation', ['new', 'fast', 'near']],
    ['difficulty', ['new', 'fast', 'near']],
  ] as const)('sorts by %s', (sort, expected) => {
    expect(pbFinder(events, { maxTravelMinutes: 45, filters: noFilters, sort }).results.map((r) => r.event.id)).toEqual(expected);
  });

  it('applies surface, elevation and confidence filters', () => {
    const trail = pbFinder(events, { maxTravelMinutes: 45, filters: { ...noFilters, surface: 'trail' }, sort: 'pb' });
    expect(trail.results.map((r) => r.event.id)).toEqual(['near']);
    const flat = pbFinder(events, { maxTravelMinutes: 45, filters: { ...noFilters, elevation: 'lt25' }, sort: 'pb' });
    expect(flat.results.map((r) => r.event.id)).toEqual(['fast', 'new']);
    const confident = pbFinder(events, { maxTravelMinutes: 45, filters: { ...noFilters, confidence: 'high' }, sort: 'pb' });
    expect(confident.results.map((r) => r.event.id)).toEqual(['fast', 'near']);
  });

  it('explains each result with PB reasons', () => {
    const [first] = pbFinder(events, { maxTravelMinutes: 45, filters: noFilters, sort: 'pb' }).results;
    expect(first!.reasons.map((r) => r.text)).toEqual(
      expect.arrayContaining(['High PB Score (92/100)', 'Low course difficulty (2.0/10)', 'Very low elevation (10 m)']),
    );
  });
});

describe('Hidden Gem V1', () => {
  it('uses the documented weights, which sum to 1', () => {
    expect(HIDDEN_GEM_V1_WEIGHTS).toEqual({ placement_opportunity: 0.35, low_participants: 0.25, travel_convenience: 0.15, reliability: 0.15, not_visited: 0.1 });
    expect(Object.values(HIDDEN_GEM_V1_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(HIDDEN_GEM_ALGORITHM).toBe('hidden_gem_v1');
  });

  it('normalises every component to 0–100 and returns a deterministic breakdown', () => {
    const e = makeEvent({ id: 'g', averageParticipants: 140, travel: travel(15), visited: false, scores: { ...scores, competitionScore: 40, pbConfidence: 'high' } });
    const components = gemComponents(e, { maxTravelMinutes: 45, top10: { count: 9, of: 12 }, timeSeconds: 1170 });
    expect(components.map((c) => [c.key, c.value, c.contribution])).toEqual([
      ['placement_opportunity', 75, 26.3],
      ['low_participants', 80, 20],
      ['travel_convenience', 67, 10.1],
      ['reliability', 100, 15],
      ['not_visited', 100, 10],
    ]);
    expect(components[0]!.basis).toBe('Top 10 in 9 of 12 recent events at 19:30');
    expect(gemScore(components)).toBe(81); // 26.25 + 20 + 10.05 + 15 + 10 = 81.3
  });

  it('falls back to inverse Competition Score without a runner time, and scores unknowns 0', () => {
    const e = makeEvent({ id: 'u', averageParticipants: null, travel: undefined, visited: undefined, scores: { ...scores, competitionScore: 30 } });
    const c = gemComponents(e, { maxTravelMinutes: 45, top10: null, timeSeconds: null });
    expect(c.map((x) => x.value)).toEqual([70, 0, 0, 100, 0]);
    expect(c[0]!.basis).toBe('Inverse of Competition Score (30/100)');
    expect(c[1]!.basis).toMatch(/unknown/);
  });

  const events = [
    makeEvent({ id: 'small', averageParticipants: 90, travel: travel(20), visited: false, scores: { ...scores, competitionScore: 40, pbScore: 70 } }),
    makeEvent({ id: 'big', averageParticipants: 420, travel: travel(10), visited: true, scores: { ...scores, competitionScore: 85, pbScore: 90 } }),
    makeEvent({ id: 'mid', averageParticipants: 180, travel: travel(25), visited: false, scores: { ...scores, competitionScore: 55, pbScore: 82 } }),
  ];
  const rank = (mode: Parameters<typeof rankHiddenGems>[1]['mode']) =>
    rankHiddenGems(events, { mode, maxTravelMinutes: 45, timeSeconds: null, top10ByEvent: new Map() }).map((g) => g.event.id);

  it('ranks deterministically and explains why each is a gem', () => {
    const gems = rankHiddenGems(events, { mode: 'all', maxTravelMinutes: 45, timeSeconds: null, top10ByEvent: new Map() });
    expect(gems.map((g) => g.event.id)).toEqual(['small', 'mid', 'big']);
    expect(gems.map((g) => g.rank)).toEqual([1, 2, 3]);
    expect(gems[0]!.reasons.map((r) => r.text)).toEqual(['Small field (about 90 runners)', 'Lower historical competition (40/100)', 'High data confidence (12 events)', 'Close to home (about 20 min, estimated)', 'Not visited yet']);
    expect(rankHiddenGems(events, { mode: 'all', maxTravelMinutes: 45, timeSeconds: null, top10ByEvent: new Map() })).toEqual(gems);
  });

  it.each([
    ['quiet', ['small', 'mid']],
    ['small_field', ['small']],
    ['fast', ['mid', 'big']],
    ['not_visited', ['small', 'mid']],
    ['easier_to_place', ['small']],
  ] as const)('mode %s filters transparently', (mode, expected) => {
    expect(rank(mode)).toEqual(expected);
  });
});

describe('placement ranking', () => {
  const placementFor = (id: string, placements: number[], fieldSize = 100) =>
    buildEventPlacement(
      makeEvent({ id }),
      placements.map((p, i) => ({ eventId: id, date: `2026-09-${String(26 - i).padStart(2, '0')}`, status: 'completed' as const, dataQuality: 'valid' as const, participantCount: fieldSize, resultCount: fieldSize, fasterCount: p - 1, equalCount: 0 })),
      'top10',
      '2026-10-01',
      { seconds: 1200, adjustment: null },
    );

  it('ranks by target frequency, then median, with too-little-data events last and empty events dropped', () => {
    const ranked = rankPlacements([
      placementFor('often', [3, 5, 8, 12, 4, 6]),
      placementFor('always', [9, 10, 8, 9, 7, 10]),
      placementFor('few', [1, 1]),
      placementFor('none', []),
    ]);
    expect(ranked.map((p) => p.event.id)).toEqual(['always', 'often', 'few']);
    expect(ranked[2]!.confidence).toBe('insufficient');
  });

  it('caps the history list and keeps the most recent first', () => {
    const p: EventPlacement = placementFor('long', Array.from({ length: 20 }, (_, i) => i + 1));
    expect(p.history).toHaveLength(12);
    expect(p.sampleSize).toBe(20);
    expect(p.history[0]!.date > p.history[1]!.date).toBe(true);
  });
});

describe('bestByMetric', () => {
  const row = (id: string, pb: number, minutes: number, median: number | null) => ({
    event: makeEvent({ id, travel: travel(minutes), scores: { ...scores, pbScore: pb } }),
    placement: median == null ? null : ({ confidence: 'high', stats: { medianPlacement: { low: median, high: median }, frequencies: { top10: { count: median <= 10 ? 5 : 1, of: 6 } } } } as unknown as EventPlacement),
  });

  it('marks the most favourable event per metric, including ties', () => {
    const best = bestByMetric([row('a', 90, 30, 4), row('b', 80, 10, 4), row('c', 90, 20, 12)]);
    expect(best.pb_score).toEqual(['a', 'c']);
    expect(best.travel).toEqual(['b']);
    expect(best.median_placement).toEqual(['a', 'b']);
    expect(best.top10).toEqual(['a', 'b']);
  });

  it('marks nothing when values are equal or missing', () => {
    const best = bestByMetric([row('a', 90, 20, null), row('b', 90, 20, null)]);
    expect(best.pb_score).toBeUndefined();
    expect(best.median_placement).toBeUndefined();
    expect(best).not.toHaveProperty('competition');
  });
});
