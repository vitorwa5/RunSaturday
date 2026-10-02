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
    expect(f.inputs.every((i) => i.role === 'frontier')).toBe(true);
    expect(f.trend.direction).toBe('stable');
  });

  it('keeps a slower 25:30 visible in the breakdown without dragging Current Form', () => {
    const f = form(weekly(['22:05', '22:08', '22:03', '22:10', '25:30']));
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('22:03'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('22:10'));
    const slow = f.inputs.find((i) => i.actualSeconds === mmss('25:30'))!;
    expect(slow).toMatchObject({ role: 'slower', share: 0 });
    expect(f.inputs.filter((i) => i.actualSeconds !== mmss('25:30')).every((i) => i.role === 'frontier')).toBe(true);
    expect(f.frontier).toEqual({ bandPercent: 3, supportingRuns: 4, fasterUnsupportedRuns: 0, fasterOutweighedRuns: 0, slowerRuns: 1 });
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

  it('counts a fast run that the other runs support in full (a new best is not treated as an error)', () => {
    const f = form(weekly(['21:40', '22:05', '22:08', '22:03', '22:10']));
    const fast = f.inputs.find((i) => i.actualSeconds === mmss('21:40'))!;
    expect(fast.role).toBe('frontier');
    expect(f.formSeconds!).toBeLessThan(mmss('22:05'));
  });

  it('does not assume an implausibly fast one-off (e.g. a mistyped time)', () => {
    const f = form(weekly(['15:00', '22:05', '22:08', '22:03', '22:10']));
    expect(f.inputs.find((i) => i.actualSeconds === mmss('15:00'))).toMatchObject({ role: 'faster_unsupported', share: 0 });
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('22:03'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('22:10'));
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
    expect(many.confidence.factors.map((f) => f.key)).toEqual(['amount', 'support', 'recency', 'consistency', 'course_factors', 'events', 'coverage']);
    expect(many.confidence.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 10);
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

  it('falls back to the recency-weighted median, at Low confidence, when no two runs agree', () => {
    const f = form(weekly(['20:00', '21:30', '23:00', '24:40']));
    expect(f.frontier).toMatchObject({ bandPercent: null, supportingRuns: 4 });
    // Newest first, so recency weights put the weighted median on 21:30 (not the fastest 20:00).
    expect(f.formSeconds).toBe(mmss('21:30'));
    expect(f.confidence.level).toBe('low');
    expect(f.limitedReason).toMatch(/No two recent performances agree closely/);
  });

  it('widens the agreement band once before falling back', () => {
    const f = form(weekly(['20:00', '21:00', '23:30', '25:00']));
    expect(f.frontier).toMatchObject({ bandPercent: 6, supportingRuns: 2 });
    expect(f.formSeconds!).toBeGreaterThan(mmss('20:00'));
    expect(f.formSeconds!).toBeLessThan(mmss('21:00'));
  });

  it('uses a deterministic weighted median', () => {
    expect(weightedMedian([3, 1, 2], [1, 1, 1])).toBe(2);
    expect(weightedMedian([1, 2, 3], [5, 1, 1])).toBe(1);
  });
});

/**
 * Current Form = current DEMONSTRATED 5K race capability (supported performance frontier), not a
 * typical parkrun time. Each fixture is checked in both chronological orders.
 */
describe('Runner Form V1: performance frontier fixtures', () => {
  /** Weekly runs, listed OLDEST first, newest 2 days ago, rotating events. */
  const chrono = (times: string[]) => times.map((t, i) => run(EVENTS[i % 3]!, 2 + 7 * (times.length - 1 - i), t));
  const both = (times: string[]) => [form(chrono(times)), form(chrono([...times].reverse()))];

  it('20:00, 20:08, 20:14 + five runs of 24:30–28:00 stays near 20 minutes, not the median', () => {
    for (const f of both(['20:00', '20:08', '20:14', '24:30', '25:00', '26:00', '27:00', '28:00'])) {
      expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('20:00'));
      expect(f.formSeconds!).toBeLessThanOrEqual(mmss('20:10'));
      expect(f.frontier).toMatchObject({ supportingRuns: 3, slowerRuns: 5 });
      // The slower runs are listed, not hidden.
      expect(f.inputs.filter((i) => i.role === 'slower').map((i) => i.actualSeconds).sort()).toEqual(['24:30', '25:00', '26:00', '27:00', '28:00'].map(mmss));
      // Only 3 runs support the frontier: at most Medium, however many slower runs exist.
      expect(f.confidence.level).toBe('medium');
      expect(f.limitedReason).toBe('Only 3 recent performances support Current Form; slower runs do not add confidence.');
      expect(f.trend.direction).toBe('limited');
    }
  });

  it('21:31, 21:44, 22:05, 23:18, 23:42, 24:05, 26:00 reflects the low-22 / high-21 range', () => {
    for (const f of both(['21:31', '21:44', '22:05', '23:18', '23:42', '24:05', '26:00'])) {
      expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('21:40'));
      expect(f.formSeconds!).toBeLessThanOrEqual(mmss('21:50'));
      expect(f.frontier).toMatchObject({ supportingRuns: 3, slowerRuns: 4 });
    }
  });

  it('19:00 then 21:40–22:05 does not assume 19:00, and the one-off lowers confidence', () => {
    const steady = form(chrono(['21:40', '21:45', '21:52', '22:00', '22:05']));
    for (const f of both(['19:00', '21:40', '21:45', '21:52', '22:00', '22:05'])) {
      expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('21:45'));
      expect(f.formSeconds!).toBeLessThanOrEqual(mmss('22:00'));
      expect(f.inputs.find((i) => i.actualSeconds === mmss('19:00'))).toMatchObject({ role: 'faster_unsupported', share: 0 });
      expect(f.confidence.score).toBeLessThan(steady.confidence.score);
      expect(f.confidence.factors.find((c) => c.key === 'support')!.detail).toMatch(/1 run faster but not repeated, so not assumed/);
    }
    // When the unrepeated 19:00 is the NEWEST run, confidence is at most Medium until it is repeated.
    const newest = form(chrono(['22:05', '22:00', '21:52', '21:45', '21:40', '19:00']));
    expect(newest.confidence.level).toBe('medium');
  });

  it('moves with genuine improvement: 22:30, 22:15, 21:58, 21:46, 21:35, 21:29', () => {
    const times = ['22:30', '22:15', '21:58', '21:46', '21:35', '21:29'];
    const f = form(chrono(times));
    expect(f.formSeconds!).toBeGreaterThan(mmss('21:29')); // not the single latest/fastest run
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('21:42'));
    const median = [...times.map(mmss)].sort((a, b) => a - b)[3]!;
    expect(f.formSeconds!).toBeLessThan(median);
    expect(f.trend.direction).toBe('improving');
    // A second run at a new, faster level moves Current Form at once.
    const breakthrough = form([run('ref-a', 1, '20:50'), run('ref-b', 8, '20:55'), ...chrono(times).map((p) => ({ ...p, date: addDays(p.date, -14) }))]);
    expect(breakthrough.formSeconds!).toBeLessThanOrEqual(mmss('20:55'));
  });

  it('follows a genuine decline: an older faster level that recent runs no longer support is history', () => {
    const f = form([
      ...['22:30', '22:35', '22:28', '22:40', '22:33', '22:31'].map((t, i) => run(EVENTS[i % 3]!, 2 + 14 * i, t)),
      ...['20:00', '20:05', '20:10'].map((t, i) => run(EVENTS[i % 3]!, 86 + 14 * i, t)),
    ]);
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('22:28'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('22:40'));
    expect(f.frontier).toMatchObject({ fasterOutweighedRuns: 3, fasterUnsupportedRuns: 0 });
    expect(f.trend.direction).toBe('declining');
  });

  it('many slower runs do not lower confidence when the frontier is consistently supported', () => {
    const frontier = ['20:02', '20:05', '20:00', '20:08', '20:04'];
    const alone = form(weekly(frontier));
    const withSlow = form([...weekly(frontier), ...['24:30', '25:10', '26:00', '27:20', '24:50', '25:40'].map((t, i) => run(EVENTS[i % 3]!, 5 + 7 * i, t))]);
    expect(withSlow.formSeconds).toBe(alone.formSeconds);
    expect(withSlow.confidence.score).toBe(alone.confidence.score);
    expect(withSlow.confidence.level).toBe('high');
    // Repeated similar fast runs raise confidence compared with just two.
    expect(alone.confidence.score).toBeGreaterThan(form(weekly(frontier.slice(0, 2))).confidence.score);
  });

  it('gives an old PB outside the horizon zero influence on the frontier', () => {
    const recent = chrono(['22:05', '22:10', '21:58', '22:02']);
    expect(form([...recent, run('ref-a', 200, '18:30'), run('ref-b', 210, '18:35')]).formSeconds).toBe(form(recent).formSeconds);
  });
});

/**
 * Phase 4B.2: confidence rests on the runs SUPPORTING the frontier. Slower runs neither drag
 * Current Form nor add confidence: 2 supporting → at most Low, 3 → at most Medium, 4+ → may be High.
 */
describe('Runner Form V1: confidence follows frontier support, not the total sample', () => {
  /** 20 slower runs, 24:00 → 29:42, interleaved by date with the fast ones. */
  const slower = (count = 20) => Array.from({ length: count }, (_, i) => run(EVENTS[i % 3]!, 5 + 7 * i, mmss('24:00') + 18 * i));

  it('CASE A: 3 supporting runs + 5 slower stays ~20:07–20:08 at no more than Medium', () => {
    const f = form(weekly(['20:00', '20:08', '20:14', '24:30', '25:00', '26:00', '27:00', '28:00']));
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('20:07'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('20:08'));
    expect(f.frontier).toMatchObject({ supportingRuns: 3, slowerRuns: 5 });
    expect(f.inputs.filter((i) => i.role === 'frontier').map((i) => i.actualSeconds).sort()).toEqual(['20:00', '20:08', '20:14'].map(mmss));
    expect(f.confidence.score).toBeGreaterThanOrEqual(RUNNER_FORM_V1.confidence.levels.high); // the score alone would say High…
    expect(f.confidence.level).toBe('medium'); // …but 3 supporting runs cap it
  });

  it('CASE B: 20:00, 20:08 + 20 runs of 24:00–30:00 stays ~20:04 at no more than Low', () => {
    const fast = [run('ref-a', 2, '20:00'), run('ref-b', 9, '20:08')];
    const f = form([...fast, ...slower()]);
    expect(f.sampleSize).toBe(22);
    expect(f.formSeconds!).toBeGreaterThanOrEqual(mmss('20:00'));
    expect(f.formSeconds!).toBeLessThanOrEqual(mmss('20:08'));
    expect(f.frontier).toMatchObject({ supportingRuns: 2, slowerRuns: 20 });
    expect(f.inputs.filter((i) => i.role === 'slower').every((i) => i.share === 0)).toBe(true);
    expect(f.confidence.level).toBe('low');
    expect(f.limitedReason).toMatch(/^Only 2 recent performances support Current Form/);
    // The 20 slower runs change neither the estimate nor the confidence score.
    const fewSlower = form([...fast, run('ref-c', 3, '25:00'), run('ref-a', 4, '26:00')]);
    expect(fewSlower.formSeconds).toBe(f.formSeconds);
    expect(fewSlower.confidence.score).toBe(f.confidence.score);
  });

  it('CASE C: 5 supporting runs may be High, and many slower runs neither raise nor lower it', () => {
    const fast = weekly(['20:00', '20:05', '20:09', '20:12', '20:07']);
    const alone = form(fast);
    const withSlow = form([...fast, ...slower()]);
    expect(withSlow.formSeconds!).toBeGreaterThanOrEqual(mmss('20:00'));
    expect(withSlow.formSeconds!).toBeLessThanOrEqual(mmss('20:12'));
    expect(withSlow.formSeconds).toBe(alone.formSeconds);
    expect(withSlow.frontier).toMatchObject({ supportingRuns: 5, slowerRuns: 20 });
    expect(withSlow.confidence.level).toBe('high');
    expect(withSlow.confidence.score).toBe(alone.confidence.score);
    expect(withSlow.limitedReason).toBeNull();
  });

  it('applies the support caps exactly: 2 → Low, 3 → Medium, 4 → High allowed', () => {
    const levelWith = (times: string[]) => form([...weekly(times), ...slower(10)]).confidence.level;
    expect(levelWith(['20:00', '20:04'])).toBe('low');
    expect(levelWith(['20:00', '20:04', '20:02'])).toBe('medium');
    expect(levelWith(['20:00', '20:04', '20:02', '20:03'])).toBe('high');
  });
});
