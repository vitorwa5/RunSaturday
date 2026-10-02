/**
 * Why runner_form_v1 uses a SUPPORTED PERFORMANCE FRONTIER.
 *
 * Current Form means current demonstrated 5K race capability, not a typical parkrun time. Five
 * deterministic candidate estimators are run on the same fixtures (one course-reference event,
 * factor 1.000, so the times are already course-adjusted; weekly runs, recency-weighted with the
 * model's 45-day half-life). Each fixture states what an acceptable answer is; only the supported
 * frontier meets every one:
 *
 *   weighted median          a typical time: 25:00 / 24:30 in fixture 1 and 23:42 in mixed
 *                            efforts (the slower bulk), and it lags improvement (21:46)
 *   previous Huber centre    the runner_form_v1 draft: still a centre of all runs, so the slower
 *                            runs pull it to 24:23 / 22:56 and 23:28; lags improvement (21:50);
 *                            only partly resists a mistyped 15:00 (21:54)
 *   weighted 20th percentile close on most fixtures, but a fixed quantile is set by the SHARE of
 *                            runs, not by agreement: a recent one-off 19:00 or a mistyped 15:00
 *                            becomes Current Form
 *   single fastest           assumes the unsupported 19:00 and the mistyped 15:00
 *   supported frontier       meets every fixture: the fastest level that ≥ 2 recent runs agree on
 *                            (20:08, 20:07, 21:48, 21:54, 21:51, 21:41, 22:07, 22:06)
 */
import { formatFinishTime } from '@runsaturday/shared';
import { describe, expect, it } from 'vitest';
import { RUNNER_FORM_V1, supportedFrontier, weightedMedian } from '../analytics/runnerForm';

const AS_OF = '2026-10-01';
const mmss = (t: string) => {
  const [m, s] = t.split(':').map(Number) as [number, number];
  return m * 60 + s;
};

type Estimator = (x: readonly number[], w: readonly number[]) => number;

/** The draft runner_form_v1 estimator: asymmetric weighted Huber centre (K_SLOW 1.5, K_FAST 3). */
const previousRobustCentre: Estimator = (x, w) => {
  const start = weightedMedian(x, w);
  const scale = Math.max(0.01, 1.4826 * weightedMedian(x.map((v) => Math.abs(v - start)), w));
  const weightOf = (u: number) => (u > 1.5 ? 1.5 / u : u < -3 ? 3 / -u : 1);
  let mu = start;
  for (let it = 0; it < 100; it++) {
    const r = x.map((v, i) => w[i]! * weightOf((v - mu) / scale));
    const next = r.reduce((s, ri, i) => s + ri * x[i]!, 0) / r.reduce((s, ri) => s + ri, 0);
    if (Math.abs(next - mu) < 1e-10) return next;
    mu = next;
  }
  return mu;
};

/** Lower weighted quantile q. */
const weightedQuantile =
  (q: number): Estimator =>
  (x, w) => {
    const order = x.map((v, i) => ({ v, w: w[i]! })).sort((a, b) => a.v - b.v);
    const total = order.reduce((s, o) => s + o.w, 0);
    let acc = 0;
    for (const o of order) if ((acc += o.w) >= q * total) return o.v;
    return order.at(-1)!.v;
  };

const CANDIDATES: Record<string, Estimator> = {
  weighted_median: weightedMedian,
  previous_huber_centre: previousRobustCentre,
  weighted_p20: weightedQuantile(0.2),
  single_fastest: (x) => Math.min(...x),
  supported_frontier: (x, w) => supportedFrontier(x, w).mu,
};

/** Runs listed OLDEST FIRST, one a week, the newest 2 days before AS_OF. */
function estimate(estimator: Estimator, times: readonly string[]): number {
  const ages = times.map((_, i) => 2 + 7 * (times.length - 1 - i));
  const x = times.map((t) => Math.log(mmss(t)));
  const w = ages.map((a) => 0.5 ** (a / RUNNER_FORM_V1.HALF_LIFE_DAYS));
  return Math.round(Math.exp(estimator(x, w)));
}

interface Fixture {
  name: string;
  times: string[];
  /** Acceptable Current Form, inclusive. */
  accept: [string, string];
}

const FIXTURES: Fixture[] = [
  // Repeated ~20:00 capability with many slower runs: stay near 20, not the median.
  { name: 'fast cluster + slower runs', times: ['20:00', '20:08', '20:14', '24:30', '25:00', '26:00', '27:00', '28:00'], accept: ['20:00', '20:20'] },
  // Same, newest first: the slower runs are older.
  { name: 'fast cluster + slower runs (fast recent)', times: ['28:00', '27:00', '26:00', '25:00', '24:30', '20:14', '20:08', '20:00'], accept: ['20:00', '20:20'] },
  // The low-22 / high-21 range, not the 23–24 minute bulk.
  { name: 'mixed efforts', times: ['21:31', '21:44', '22:05', '23:18', '23:42', '24:05', '26:00'], accept: ['21:31', '22:05'] },
  // A single 19:00 must not be assumed.
  { name: 'unsupported 19:00', times: ['19:00', '21:40', '21:45', '21:52', '22:00', '22:05'], accept: ['21:40', '22:05'] },
  { name: 'unsupported 19:00 (newest)', times: ['22:05', '22:00', '21:52', '21:45', '21:40', '19:00'], accept: ['21:40', '22:05'] },
  // Genuine improvement: respond to it (faster than the earlier runs), not jump to the last one.
  { name: 'improvement', times: ['22:30', '22:15', '21:58', '21:46', '21:35', '21:29'], accept: ['21:29', '21:45'] },
  // A mistyped 15:00 among steady ~22:06 runs.
  { name: 'typo 15:00', times: ['22:05', '22:08', '22:03', '22:10', '15:00'], accept: ['22:00', '22:10'] },
  // Steady runner: every sensible method agrees.
  { name: 'steady', times: ['22:05', '22:08', '22:03', '22:10', '22:06', '22:04'], accept: ['22:03', '22:10'] },
];

/** Each candidate's value per fixture, for the documentation table. */
export const table = () => FIXTURES.map((f) => ({ fixture: f.name, accept: f.accept.join('–'), ...Object.fromEntries(Object.keys(CANDIDATES).map((c) => [c, formatFinishTime(estimate(CANDIDATES[c]!, f.times))])) }));

const passes = (name: string, f: Fixture) => {
  const v = estimate(CANDIDATES[name]!, f.times);
  return v >= mmss(f.accept[0]) && v <= mmss(f.accept[1]);
};

describe('Current Form estimator: candidate comparison', () => {
  it('only the supported frontier meets every fixture', () => {
    const failures = Object.fromEntries(Object.keys(CANDIDATES).map((name) => [name, FIXTURES.filter((f) => !passes(name, f)).map((f) => f.name)]));
    expect(failures).toEqual({
      weighted_median: ['fast cluster + slower runs', 'fast cluster + slower runs (fast recent)', 'mixed efforts', 'improvement'],
      previous_huber_centre: ['fast cluster + slower runs', 'fast cluster + slower runs (fast recent)', 'mixed efforts', 'unsupported 19:00 (newest)', 'improvement', 'typo 15:00'],
      weighted_p20: ['unsupported 19:00 (newest)', 'typo 15:00'],
      single_fastest: ['unsupported 19:00', 'unsupported 19:00 (newest)', 'typo 15:00'],
      supported_frontier: [],
    });
  });
});
