import { addDays } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { assessConfidence, CONFIDENCE_V2, levelFromScore, medianAbsoluteDeviation, STABILITY_SCALES } from '../domain/confidence';

const AS_OF = '2026-10-01';
/** n weekly observations ending `daysAgo` before AS_OF, with values from `valueAt`. */
const weekly = (n: number, daysAgo: number, valueAt: (i: number) => number = () => 1300) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(AS_OF, -daysAgo - 7 * i), value: valueAt(i) }));
const assess = (observations: { date: string; value: number }[], eligibleCount = observations.length) =>
  assessConfidence({ observations, eligibleCount, asOfDate: AS_OF, stability: STABILITY_SCALES.finishTimes });
const factor = (a: ReturnType<typeof assess>, key: string) => a.factors.find((f) => f.key === key)!.value;

describe('Confidence V2', () => {
  it('uses the documented weights', () => {
    expect(CONFIDENCE_V2.weights).toEqual({ amount: 0.4, recency: 0.25, completeness: 0.2, stability: 0.15 });
  });

  it('many recent, complete, stable observations → High', () => {
    const a = assess(weekly(13, 5, (i) => 1300 + (i % 3) * 10));
    expect(factor(a, 'amount')).toBe(100);
    expect(factor(a, 'recency')).toBe(100);
    expect(factor(a, 'completeness')).toBe(100);
    expect(factor(a, 'stability')).toBeGreaterThan(90);
    expect(a.level).toBe('high');
    expect(a.score).toBeGreaterThanOrEqual(95);
  });

  it('caps the amount factor at 100 however many events there are', () => {
    expect(factor(assess(weekly(50, 5)), 'amount')).toBe(100);
    expect(factor(assess(weekly(6, 5)), 'amount')).toBe(50);
  });

  it('few observations → Limited data regardless of the other factors', () => {
    const a = assess(weekly(2, 5));
    expect(a.level).toBe('insufficient');
    expect(factor(a, 'stability')).toBe(0);
    expect(levelFromScore(99, 2)).toBe('insufficient');
  });

  it('stale observations lose recency and drop a level', () => {
    const fresh = assess(weekly(8, 3));
    const stale = assess(weekly(8, 60));
    expect(factor(fresh, 'recency')).toBe(100);
    expect(factor(stale, 'recency')).toBe(36); // 100 × (1 − (60 − 7) / 83)
    expect(stale.score).toBeLessThan(fresh.score);
    expect(['medium', 'low']).toContain(stale.level);
    expect(factor(assess(weekly(8, 120)), 'recency')).toBe(0);
  });

  it('incomplete observations (partial or unvalidated results) lose completeness', () => {
    const a = assess(weekly(6, 5), 12);
    expect(factor(a, 'completeness')).toBe(50);
    expect(a.score).toBeLessThan(assess(weekly(6, 5), 6).score);
  });

  it('one extreme outlier does not destroy stability (median/MAD)', () => {
    const steady = weekly(12, 5, (i) => 1300 + (i % 2) * 8);
    const withOutlier = steady.map((o, i) => (i === 4 ? { ...o, value: 2400 } : o));
    expect(factor(assess(withOutlier), 'stability')).toBeGreaterThan(90);
    expect(assess(withOutlier).level).toBe('high');
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 1000])).toBe(1);
  });

  it('genuinely unstable observations score low on stability', () => {
    const erratic = weekly(12, 5, (i) => (i % 2 === 0 ? 1100 : 1500));
    expect(factor(assess(erratic), 'stability')).toBe(0);
  });

  it('scores no data as Limited data with zeroed factors', () => {
    const a = assess([], 0);
    expect(a).toMatchObject({ level: 'insufficient', score: 0 });
  });
});
