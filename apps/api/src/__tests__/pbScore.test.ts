import type { DifficultyBreakdown, PbFinderResponse } from '@runsaturday/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { computeCoreAnalytics } from '../analytics/core';
import type { CompetitionOccurrenceInput } from '../analytics/competition';
import type { CourseFactorResult } from '../analytics/courseSpeed';
import type { CourseFacts } from '../analytics/difficulty';
import { computePbScores, PB_V1 } from '../analytics/pbScore';
import { buildTestApp } from './helpers';
import { AS_OF, REPLICATES, synth } from './synthRunners';

const confident = { level: 'high' as const, score: 90, factors: [] };
const factor = (eventId: string, value: number | null, level: CourseFactorResult['confidence']['level'] = 'high'): CourseFactorResult => ({
  eventId,
  version: 'course_speed_v1',
  asOfDate: AS_OF,
  windowDays: 365,
  factor: value,
  logFactor: value != null ? Math.log(value) : null,
  bootstrap: [],
  matchedRunners: value != null ? 80 : 3,
  comparisons: value != null ? 200 : 3,
  connectedEvents: 3,
  medianGapDays: 7,
  dispersion: 0.02,
  bootstrapHalfWidth: 0.003,
  latestComparison: AS_OF,
  confidence: value != null ? { ...confident, level } : { level: 'insufficient', score: 0, factors: [] },
  limitedReason: value != null ? null : 'Too few matched runners.',
});
const difficulty = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, value]) => [id, { metric: 'difficulty', version: 'difficulty_v1', value, asOfDate: AS_OF, components: [], confidence: confident } satisfies DifficultyBreakdown]));
const pbOf = (results: ReturnType<typeof computePbScores>) => new Map(results.map((r) => [r.eventId, r]));

describe('PB Score V1', () => {
  it('scores a faster course higher', () => {
    const pb = pbOf(computePbScores([factor('fast', 0.97), factor('mid', 1.0), factor('slow', 1.03)], difficulty({ fast: 3, mid: 3, slow: 3 }), AS_OF));
    expect(pb.get('fast')!.value!).toBeGreaterThan(pb.get('mid')!.value!);
    expect(pb.get('mid')!.value!).toBeGreaterThan(pb.get('slow')!.value!);
  });

  it('scores a structurally easier course slightly higher when observed speed is the same', () => {
    const pb = pbOf(
      computePbScores([factor('easy', 1.0), factor('hard', 1.0), factor('fast', 0.97), factor('slow', 1.03)], difficulty({ easy: 2, hard: 6, fast: 4, slow: 4 }), AS_OF),
    );
    const gap = pb.get('easy')!.value! - pb.get('hard')!.value!;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(100 * PB_V1.weights.structural);
  });

  it('stays within 0–100 and weights observed speed 75%, structure 25%', () => {
    const results = computePbScores([factor('a', 0.95), factor('b', 1.0), factor('c', 1.05)], difficulty({ a: 1, b: 5, c: 10 }), AS_OF);
    for (const r of results) {
      expect(r.value!).toBeGreaterThanOrEqual(0);
      expect(r.value!).toBeLessThanOrEqual(100);
      expect(r.components.map((c) => [c.key, c.weight])).toEqual([
        ['course_speed', 0.75],
        ['structural', 0.25],
      ]);
    }
    expect(pbOf(results).get('a')!.value).toBe(100);
    expect(pbOf(results).get('c')!.value).toBe(0);
  });

  it('withholds the score when the Course Speed Factor is unavailable (no demo fallback)', () => {
    const pb = pbOf(computePbScores([factor('a', 0.97), factor('b', 1.0), factor('c', 1.03), factor('none', null)], difficulty({ a: 3, b: 3, c: 3, none: 1 }), AS_OF));
    expect(pb.get('none')!.value).toBeNull();
    expect(pb.get('none')!.confidence.level).toBe('insufficient');
    expect(pb.get('none')!.limitedReason).toBeTruthy();
  });

  it('withholds every score when too few events have factors to compare', () => {
    const results = computePbScores([factor('a', 0.97), factor('b', 1.03)], difficulty({ a: 3, b: 3 }), AS_OF);
    expect(results.every((r) => r.value == null)).toBe(true);
  });

  it('is never affected by Competition', () => {
    const ids = ['A', 'B', 'C'];
    const performances = synth({ truth: { A: 0.98, B: 1.04, C: 1 }, groups: [{ runners: 80, rotation: ids }] });
    const courses: CourseFacts[] = ids.map((eventId) => ({ eventId, elevationM: 20, surface: 'tarmac', courseType: 'one_lap', laps: 1 }));
    const occurrence = (eventId: string, winner: number): CompetitionOccurrenceInput => ({
      eventId,
      date: AS_OF,
      status: 'completed',
      dataQuality: 'valid',
      participantCount: 200,
      resultCount: 200,
      winnerSeconds: winner,
      thirdSeconds: winner + 40,
      fifthSeconds: winner + 70,
      tenthSeconds: winner + 120,
      fieldDepthSeconds: winner + 250,
    });
    const strongAtA = computeCoreAnalytics(courses, [occurrence('A', 900), occurrence('B', 1100), occurrence('C', 1150)], performances, AS_OF, { bootstrapReplicates: REPLICATES });
    const strongAtC = computeCoreAnalytics(courses, [occurrence('A', 1150), occurrence('B', 1100), occurrence('C', 900)], performances, AS_OF, { bootstrapReplicates: REPLICATES });
    for (const id of ids) {
      expect(strongAtA.competition.get(id)).toBeDefined();
      expect(strongAtA.pb.get(id)!.value).toBe(strongAtC.pb.get(id)!.value);
    }
  });

  describe('through the API', () => {
    let app: FastifyInstance | undefined;
    afterEach(async () => app?.close());

    it('is not changed by PB Finder filters (computed from the snapshot cohort)', async () => {
      app = await buildTestApp();
      const all = (await app.inject('/api/pb-finder?maxTravel=90')).json<PbFinderResponse>();
      const tarmac = (await app.inject('/api/pb-finder?maxTravel=90&surface=tarmac')).json<PbFinderResponse>();
      const notVisited = (await app.inject('/api/pb-finder?maxTravel=90&visited=not_visited')).json<PbFinderResponse>();
      expect(tarmac.results.length).toBeLessThan(all.results.length);
      const scoreOf = (body: PbFinderResponse) => new Map(body.results.map((r) => [r.event.id, r.event.scores!.pbScore]));
      const base = scoreOf(all);
      for (const body of [tarmac, notVisited]) {
        for (const [id, score] of scoreOf(body)) expect(score).toBe(base.get(id));
      }
    });
  });
});
