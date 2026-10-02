import { addDays } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { buildComparisons, computeCourseFactors, COURSE_SPEED_V1, ratioInterval, type CourseFactorResult, type PerformanceInput } from '../analytics/courseSpeed';
import { hashString, mulberry32 } from '../domain/random';
import { adjustPerformance, ADJUSTMENT_UNAVAILABLE, isReliableFactor } from '../services/courseAdjustment';
import { AS_OF, normal, REPLICATES, synth } from './synthRunners';

const fit = (ids: string[], perf: PerformanceInput[]) =>
  new Map(computeCourseFactors(ids, perf, { asOfDate: AS_OF, replicates: REPLICATES }).map((f) => [f.eventId, f]));

describe('Course Speed Factor V1: matching', () => {
  it('matches one-to-one by nearest date without reusing a run', () => {
    const p = (eventId: string, date: string, seconds: number): PerformanceInput => ({ athleteKey: 'x', eventId, date, seconds });
    // Three runs at A around a single run at B: only ONE comparison, to the nearest A run.
    const comps = buildComparisons([p('A', '2026-09-05', 1200), p('A', '2026-09-12', 1210), p('A', '2026-09-26', 1190), p('B', '2026-09-19', 1260)]);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.gapDays).toBe(7);
    expect(comps[0]!.y).toBeCloseTo(Math.log(1260 / 1210), 12);
  });

  it('caps the total weight one athlete contributes to one event pair', () => {
    const runs: PerformanceInput[] = [];
    for (let w = 0; w < 20; w++) runs.push({ athleteKey: 'regular', eventId: w % 2 ? 'B' : 'A', date: addDays(AS_OF, -7 * w), seconds: 1200 });
    const comps = buildComparisons(runs);
    expect(comps.length).toBe(10);
    expect(comps.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(COURSE_SPEED_V1.ATHLETE_PAIR_WEIGHT_CAP, 9);
  });

  it('excludes runs more than 90 days apart and down-weights longer gaps', () => {
    const p = (eventId: string, date: string): PerformanceInput => ({ athleteKey: 'x', eventId, date, seconds: 1200 });
    expect(buildComparisons([p('A', '2026-01-03'), p('B', '2026-04-11')])).toHaveLength(0); // 98 days
    expect(buildComparisons([p('A', '2026-01-03'), p('B', '2026-01-10')])[0]!.weight).toBe(1);
    expect(buildComparisons([p('A', '2026-01-03'), p('B', '2026-02-21')])[0]!.weight).toBe(0.5);
  });
});

describe('Course Speed Factor V1: model', () => {
  const pair = { truth: { A: 1, B: 1.05 }, groups: [{ runners: 80, rotation: ['A', 'B'] }] };

  it('gives identical courses equal factors', () => {
    const f = fit(['A', 'B'], synth({ truth: { A: 1, B: 1 }, groups: [{ runners: 80, rotation: ['A', 'B'] }] }));
    expect(f.get('A')!.factor!).toBeCloseTo(f.get('B')!.factor!, 2);
    expect(f.get('A')!.factor!).toBeCloseTo(1, 2);
  });

  it('recovers a course that is consistently 5% slower as a ratio of about 1.05', () => {
    const f = fit(['A', 'B'], synth(pair));
    expect(f.get('B')!.factor! / f.get('A')!.factor!).toBeCloseTo(1.05, 2);
  });

  it('is invariant to input order', () => {
    const perf = synth(pair);
    const shuffled = [...perf].sort((x, y) => hashString(`${x.athleteKey}${x.date}`) - hashString(`${y.athleteKey}${y.date}`));
    const a = fit(['A', 'B'], perf);
    const b = fit(['B', 'A'], [...shuffled].reverse());
    for (const id of ['A', 'B']) {
      expect(b.get(id)!.factor).toBe(a.get(id)!.factor);
      expect(b.get(id)!.bootstrap).toEqual(a.get(id)!.bootstrap);
    }
  });

  it('is robust to one extreme outlier comparison', () => {
    const perf = synth(pair);
    const clean = fit(['A', 'B'], perf);
    // One runner jogs B at walking pace, right next to a normal A run.
    const outlier = perf.map((p) => (p.athleteKey === 'g0-0000' && p.eventId === 'B' && p.date === AS_OF ? { ...p, seconds: p.seconds * 2 } : p));
    expect(outlier).not.toEqual(perf);
    const robust = fit(['A', 'B'], outlier);
    const ratio = (m: Map<string, CourseFactorResult>) => m.get('B')!.factor! / m.get('A')!.factor!;
    expect(Math.abs(ratio(robust) - ratio(clean))).toBeLessThan(0.001);
  });

  it('gives a disconnected event no factor (Limited data), with no elevation fallback', () => {
    const f = fit(
      ['A', 'B', 'C'],
      synth({ truth: { A: 1, B: 1.03, C: 0.97 }, groups: [{ runners: 80, rotation: ['A', 'B'] }, { runners: 40, rotation: ['C'] }] }),
    );
    expect(f.get('C')!.factor).toBeNull();
    expect(f.get('C')!.confidence.level).toBe('insufficient');
    expect(f.get('C')!.limitedReason).toMatch(/No matched runners/);
    expect(isReliableFactor(f.get('C'))).toBe(false);
  });

  it('rates a sparsely connected event Low or Limited and a well-connected one higher', () => {
    const base = synth({ truth: { A: 1, B: 1.03, C: 0.98 }, groups: [{ runners: 90, rotation: ['A', 'B', 'C'] }], weeks: 16 });
    // D: 25 visitors who ran it twice about 11 weeks before their A runs (long date gaps, one neighbour).
    const sparse: PerformanceInput[] = [];
    for (let r = 0; r < 25; r++) {
      const rand = mulberry32(hashString(`sparse|${r}`));
      const ability = 1200 * Math.exp(0.12 * normal(rand));
      const run = (eventId: string, weeksAgo: number, truth: number) =>
        sparse.push({ athleteKey: `d-${r}`, eventId, date: addDays(AS_OF, -7 * weeksAgo), seconds: Math.round(ability * truth * Math.exp(0.015 * normal(rand))) });
      run('D', 12, 1.02);
      run('D', 13, 1.02);
      run('A', 1, 1);
      run('A', 2, 1);
    }
    const f = fit(['A', 'B', 'C', 'D'], [...base, ...sparse]);
    expect(f.get('D')!.factor).not.toBeNull();
    expect(['low', 'insufficient']).toContain(f.get('D')!.confidence.level);
    expect(isReliableFactor(f.get('D'))).toBe(false);
    expect(['high', 'medium']).toContain(f.get('A')!.confidence.level);
    expect(f.get('A')!.confidence.score).toBeGreaterThan(f.get('D')!.confidence.score);

    // Fewer than the minimum matched runners: no factor at all.
    const tooFew = fit(['A', 'B', 'C', 'D'], [...base, ...sparse.filter((p) => Number(p.athleteKey.slice(2)) < 10)]);
    expect(tooFew.get('D')!.factor).toBeNull();
    expect(tooFew.get('D')!.limitedReason).toMatch(/Too few matched runners/);
  });

  it('centres fitted factors on 1.000 (geometric mean)', () => {
    const f = fit(['A', 'B', 'C'], synth({ truth: { A: 1.1, B: 1.15, C: 1.2 }, groups: [{ runners: 80, rotation: ['A', 'B', 'C'] }] }));
    const logs = [...f.values()].map((x) => x.logFactor!);
    expect(logs.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 9);
  });

  it('keeps bootstrap draws aligned and the ratio interval around the point ratio', () => {
    const f = fit(['A', 'B'], synth(pair));
    const [a, b] = [f.get('A')!, f.get('B')!];
    expect(a.bootstrap).toHaveLength(REPLICATES);
    expect(b.bootstrap).toHaveLength(REPLICATES);
    const interval = ratioInterval(a, b)!;
    const ratio = b.factor! / a.factor!;
    expect(interval.low).toBeLessThanOrEqual(ratio);
    expect(interval.high).toBeGreaterThanOrEqual(ratio);
    expect(interval.replicates).toBe(REPLICATES);
  });
});

describe('Course adjustment', () => {
  const f = fit(['A', 'B', 'C'], synth({ truth: { A: 0.98, B: 1.04, C: 1 }, groups: [{ runners: 90, rotation: ['A', 'B', 'C'] }] }));

  it('converts source → cohort reference → target and rounds to a whole second', () => {
    const adj = adjustPerformance({ eventId: 'A', name: 'A', seconds: 1175 }, f.get('A'), { eventId: 'B' }, f.get('B'));
    expect(adj.available).toBe(true);
    expect(adj.equivalentSeconds).toBe(Math.round(1175 * (f.get('B')!.factor! / f.get('A')!.factor!)));
    expect(adj.deltaSeconds).toBe(adj.equivalentSeconds! - 1175);
    expect(adj.conversionRange!.lowSeconds).toBeLessThanOrEqual(adj.equivalentSeconds!);
    expect(adj.conversionRange!.highSeconds).toBeGreaterThanOrEqual(adj.equivalentSeconds!);
  });

  it('round-trips source → target → source within a second', () => {
    for (const seconds of [1000, 1175, 1500, 2400]) {
      const there = adjustPerformance({ eventId: 'A', name: 'A', seconds }, f.get('A'), { eventId: 'B' }, f.get('B'));
      const back = adjustPerformance({ eventId: 'B', name: 'B', seconds: there.equivalentSeconds! }, f.get('B'), { eventId: 'A' }, f.get('A'));
      expect(Math.abs(back.equivalentSeconds! - seconds)).toBeLessThanOrEqual(1);
    }
  });

  it('leaves the time unchanged at the source event', () => {
    const adj = adjustPerformance({ eventId: 'A', name: 'A', seconds: 1175 }, f.get('A'), { eventId: 'A' }, f.get('A'));
    expect(adj.equivalentSeconds).toBe(1175);
    expect(adj.deltaSeconds).toBe(0);
  });

  it('does not depend on the cohort reference: rescaling every factor by a constant changes no equivalent', () => {
    // 1.000 is only the cohort's geometric mean; moving it multiplies every factor by the same c.
    const rescale = (c: number) =>
      new Map(
        [...f].map(([id, x]) => [
          id,
          { ...x, factor: x.factor! * c, logFactor: x.logFactor! + Math.log(c), bootstrap: x.bootstrap.map((v) => v + Math.log(c)) } satisfies CourseFactorResult,
        ]),
      );
    const ids = ['A', 'B', 'C'];
    const convert = (m: Map<string, CourseFactorResult>, from: string, to: string, seconds: number) =>
      adjustPerformance({ eventId: from, name: from, seconds }, m.get(from), { eventId: to }, m.get(to));
    for (const c of [0.8, 0.97, 1.17, 2.5]) {
      const scaled = rescale(c);
      for (const from of ids) {
        for (const to of ids) {
          for (const seconds of [960, 1175, 1500, 2400, 3300]) {
            const base = convert(f, from, to, seconds);
            const moved = convert(scaled, from, to, seconds);
            expect(moved.equivalentSeconds).toBe(base.equivalentSeconds);
            expect(moved.deltaSeconds).toBe(base.deltaSeconds);
            expect(moved.ratio).toBeCloseTo(base.ratio!, 12);
            expect(moved.conversionRange).toEqual(base.conversionRange);
          }
        }
      }
    }
  });

  it('returns the source time unchanged when source and target are the same event (any factor scale)', () => {
    for (const id of ['A', 'B', 'C']) {
      for (const seconds of [960, 1175, 2400]) {
        const adj = adjustPerformance({ eventId: id, name: id, seconds }, f.get(id), { eventId: id }, f.get(id));
        expect(adj).toMatchObject({ available: true, equivalentSeconds: seconds, deltaSeconds: 0, ratio: 1 });
      }
    }
  });

  it('refuses to adjust with an unreliable factor', () => {
    const weak: CourseFactorResult = { ...f.get('B')!, confidence: { ...f.get('B')!.confidence, level: 'low' } };
    const adj = adjustPerformance({ eventId: 'A', name: 'A', seconds: 1175 }, f.get('A'), { eventId: 'B' }, weak);
    expect(adj.available).toBe(false);
    expect(adj.equivalentSeconds).toBeNull();
    expect(adj.reason).toBe(ADJUSTMENT_UNAVAILABLE);
  });
});
