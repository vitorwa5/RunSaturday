import { addDays } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { computeRunnerForm, RUNNER_FORM_V1, weightedMedian, type FormCourseFactor, type FormPerformance } from '../analytics/runnerForm';

const AS_OF = '2026-10-01';
const mmss = (t: string) => {
  const [m, s] = t.split(':').map(Number) as [number, number];
  return m * 60 + s;
};
const high = (factor: number, score = 90): FormCourseFactor => ({ factor, confidence: { level: 'high', score } });
/** Reference-factor test events: factor exactly 1.000, so actual = course-adjusted reference. */
const FACTORS = new Map<string, FormCourseFactor>([
  ['ref-a', high(1)],
  ['ref-b', high(1)],
  ['ref-c', high(1)],
  ['fast', high(0.9887)],
  ['hilly', high(1.0302)],
  ['medium', { factor: 1, confidence: { level: 'medium', score: 65 } }],
  ['low', { factor: 1, confidence: { level: 'low', score: 40 } }],
  ['nofactor', { factor: null, confidence: { level: 'insufficient', score: 0 } }],
]);

let n = 0;
const run = (eventId: string | null, daysAgo: number, time: string | number, extra: Partial<FormPerformance> = {}): FormPerformance => ({
  id: `p${++n}`,
  eventId,
  eventName: eventId ?? 'Warrington 5K',
  date: addDays(AS_OF, -daysAgo),
  finishTimeSeconds: typeof time === 'number' ? time : mmss(time),
  distanceMeters: 5000,
  ...extra,
});
const form = (runs: FormPerformance[], factors = FACTORS) => computeRunnerForm(runs, factors, AS_OF);
const EVENTS = ['ref-a', 'ref-b', 'ref-c'];
/** Weekly runs, newest first, rotating through three reference-factor events. */
const weekly = (times: string[]) => times.map((t, i) => run(EVENTS[i % 3]!, 7 * i + 2, t));

describe('Runner Form V1: critical regressions', () => {
  it('ignores a 7-year-old 21:00 PB: Current Form stays with the recent ~22:10 runs', () => {
    const recent = weekly(['22:03', '22:12', '22:08', '22:16', '22:10']);
    const withPb = form([...recent, run('ref-a', 7 * 365, '21:00')]);
    const withoutPb = form(recent);
    expect(withPb.formSeconds).toBe(withoutPb.formSeconds);
    expect(withPb.formSeconds!).toBeGreaterThanOrEqual(mmss('22:03'));
    expect(withPb.formSeconds!).toBeLessThanOrEqual(mmss('22:16'));
    expect(withPb.excluded).toEqual([expect.objectContaining({ reason: 'outside_horizon', finishTimeSeconds: mmss('21:00') })]);
  });

  it('sees 21:50 on a fast course and 22:45 on a hilly one as the same ~22:05 ability, not a 55 s decline', () => {
    const f = form([run('hilly', 3, '22:45'), run('fast', 10, '21:50'), run('hilly', 17, '22:45'), run('fast', 24, '21:50'), run('hilly', 31, '22:45'), run('fast', 38, '21:50')]);
    expect(Math.abs(f.formSeconds! - mmss('22:05'))).toBeLessThanOrEqual(2);
    for (const i of f.inputs) expect(Math.abs(i.referenceSeconds - mmss('22:05'))).toBeLessThanOrEqual(2);
    expect(f.inputs.every((i) => i.robustWeight === 1)).toBe(true);
    expect(f.trend.direction).toBe('stable');
  });

  it('keeps a 25:30 bad day represented but with reduced influence', () => {
    const f = form(weekly(['22:05', '22:08', '22:03', '22:10', '25:30']));
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('22:03'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('22:15'));
    const slow = f.inputs.find((i) => i.actualSeconds === mmss('25:30'))!;
    expect(slow.robustWeight).toBeGreaterThan(0);
    expect(slow.robustWeight).toBeLessThan(0.2);
    expect(f.inputs.filter((i) => i.actualSeconds !== mmss('25:30')).every((i) => i.robustWeight === 1)).toBe(true);
  });

  it('follows real improvement and reports an improving trend, without jumping to the single best run', () => {
    // Newest first: 21:50 now, about 10 s slower each week before.
    const times = ['21:50', '22:01', '22:09', '22:20', '22:31', '22:39', '22:50', '23:01'];
    const f = form(weekly(times));
    const mean = times.map(mmss).reduce((s, v) => s + v, 0) / times.length;
    expect(f.formSeconds!).toBeLessThan(mean);
    expect(f.formSeconds!).toBeGreaterThan(mmss('21:50'));
    expect(f.trend.direction).toBe('improving');
    expect(f.trend.changePercentPer90Days!).toBeLessThan(0);
  });

  it('does not let an external 19:25 road race become Current Form or a reference-course result', () => {
    const f = form([run(null, 20, '19:25'), ...weekly(['19:48', '19:52', '19:50', '19:49'])]);
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('19:48'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('19:52'));
    expect(f.inputs.some((i) => i.actualSeconds === mmss('19:25'))).toBe(false);
    expect(f.excluded).toEqual([expect.objectContaining({ reason: 'course_not_modelled', explanation: expect.stringMatching(/not currently modelled/) })]);
  });
});

describe('Runner Form V1: behaviour', () => {
  it('weights recent runs more than older ones (exponential half-life)', () => {
    const f = form([run('ref-a', 0, '22:00'), run('ref-b', 45, '22:00'), run('ref-c', 90, '22:00')]);
    expect(f.inputs.map((i) => i.recencyWeight)).toEqual([1, 0.5, 0.25]);
    // Same times either way, but the recent half pulls the estimate towards itself.
    const recentFaster = form([run('ref-a', 3, '21:50'), run('ref-b', 10, '21:52'), run('ref-c', 120, '22:40'), run('ref-a', 130, '22:42')]);
    expect(recentFaster.formSeconds!).toBeLessThan((mmss('21:51') + mmss('22:41')) / 2);
  });

  it('counts a legitimate fast run in full (a new best is not treated as an error)', () => {
    const f = form(weekly(['21:40', '22:05', '22:08', '22:03', '22:10']));
    const fast = f.inputs.find((i) => i.actualSeconds === mmss('21:40'))!;
    expect(fast.robustWeight).toBe(1);
    expect(f.formSeconds!).toBeLessThan(mmss('22:05'));
  });

  it('down-weights an implausibly fast outlier (e.g. a mistyped time)', () => {
    const f = form(weekly(['15:00', '22:05', '22:08', '22:03', '22:10']));
    expect(f.inputs.find((i) => i.actualSeconds === mmss('15:00'))!.robustWeight).toBeLessThan(0.2);
    expect(f.formSeconds!).toBeGreaterThan(mmss('21:30'));
  });

  it('gives no Current Form without evidence, and only an indicative value from a single run', () => {
    expect(form([])).toMatchObject({ status: 'unavailable', formSeconds: null, indicativeSeconds: null, confidence: { level: 'insufficient' } });
    const one = form([run('hilly', 5, '22:45')]);
    expect(one).toMatchObject({ status: 'indicative', formSeconds: null, confidence: { level: 'insufficient' } });
    expect(Math.abs(one.indicativeSeconds! - mmss('22:05'))).toBeLessThanOrEqual(2);
    expect(one.limitedReason).toMatch(/Only one eligible/);
  });

  it('caps 2–3 runs at Low confidence and rewards more consistent, recent, varied data', () => {
    const three = form(weekly(['22:05', '22:08', '22:03']));
    expect(three.status).toBe('estimate');
    expect(three.confidence.level).toBe('low');
    const many = form(weekly(['22:05', '22:08', '22:03', '22:10', '22:06', '22:04', '22:09', '22:07']));
    expect(['high', 'medium']).toContain(many.confidence.level);
    expect(many.confidence.score).toBeGreaterThan(three.confidence.score);
    expect(many.confidence.factors.map((f) => f.key)).toEqual(['amount', 'recency', 'consistency', 'course_factors', 'events', 'coverage']);
    expect(many.eventCount).toBe(3);
  });

  it('treats stale data cautiously', () => {
    const stale = form(['22:05', '22:08', '22:03', '22:10', '22:06', '22:04'].map((t, i) => run(EVENTS[i % 3]!, 100 + 7 * i, t)));
    expect(stale.status).toBe('estimate');
    expect(['low', 'insufficient']).toContain(stale.confidence.level);
    expect(stale.limitedReason).toMatch(/may be out of date/);
    expect(stale.confidence.factors.find((f) => f.key === 'recency')!.value).toBe(19); // 100 × (120 − 100) / (120 − 14)
  });

  it('handles course-factor confidence: Medium counts less, Low and missing factors are excluded', () => {
    const f = form([run('medium', 2, '22:00'), run('ref-a', 9, '22:00'), run('low', 16, '22:00'), run('nofactor', 23, '22:00')]);
    expect(f.inputs.map((i) => [i.eventId, i.courseWeight])).toEqual([
      ['medium', 0.75],
      ['ref-a', 1],
    ]);
    expect(f.excluded.map((e) => e.reason).sort()).toEqual(['factor_low_confidence', 'factor_unavailable']);
  });

  it('reports a stable trend for steady data and limited for too little', () => {
    expect(form(weekly(['22:05', '22:08', '22:03', '22:10', '22:06', '22:04'])).trend.direction).toBe('stable');
    expect(form(weekly(['22:05', '22:08', '22:03'])).trend.direction).toBe('limited');
  });

  it('is 5000 m only', () => {
    const f = form([...weekly(['22:05', '22:08']), run('ref-a', 4, 2700, { distanceMeters: 10000 })]);
    expect(f.inputs).toHaveLength(2);
    expect(f.excluded).toEqual([expect.objectContaining({ reason: 'not_5k' })]);
    expect(RUNNER_FORM_V1.DISTANCE_METERS).toBe(5000);
  });

  it('is deterministic and independent of input order', () => {
    const runs = weekly(['22:05', '22:08', '22:03', '22:10', '25:30', '21:58']);
    expect(form([...runs].reverse())).toEqual(form(runs));
  });

  it('uses a deterministic weighted median', () => {
    expect(weightedMedian([3, 1, 2], [1, 1, 1])).toBe(2);
    expect(weightedMedian([1, 2, 3], [5, 1, 1])).toBe(1);
  });
});
