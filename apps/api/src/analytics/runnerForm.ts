/**
 * RUNNER FORM V1 (runner_form_v1): the runner's CURRENT 5K FORM, a modelled estimate of present
 * ability from several recent performances. Pure and deterministic.
 *
 * It is deliberately separate from the Overall 5K PB, the parkrun PB and the recent best: an old
 * PB is history, not current ability, and a single best result is not form.
 *
 * 1. ELIGIBILITY. 5000 m performances dated within HORIZON_DAYS up to asOfDate, at a KNOWN
 *    internal event whose Course Speed Factor is at least Medium confidence. Everything else is
 *    listed as excluded with a reason, never silently used: other distances, unmodelled external
 *    courses (an unknown course is NOT assumed to be neutral, factor 1.000), events without a
 *    factor and factors of Low/Limited confidence.
 * 2. COURSE NORMALISATION. neutral = actual ÷ course factor: the equivalent time at the
 *    analysed-cohort reference course (1.000). The model works in log space, x = ln(neutral), so
 *    differences are ratios and mean the same for any runner.
 * 3. WEIGHTS. recency = 0.5^(ageDays / HALF_LIFE_DAYS) (smooth exponential decay, no buckets);
 *    course = by factor confidence (High 1.0, Medium 0.75).
 * 4. ROBUST CENTRE. A weighted, ASYMMETRIC Huber M-estimate of x:
 *      start   mu = weighted median of x
 *      scale   s  = max(MIN_SCALE, 1.4826 × weighted MAD about that median)
 *      weight  u = (x − mu) / s;  slow side (u > K_SLOW): K_SLOW / u;  fast side (u < −K_FAST):
 *              K_FAST / |u|;  otherwise 1
 *      iterate mu = Σ b·r·x / Σ b·r  until it converges (b = recency × course weight)
 *    A very slow run (jogging, pacing, illness) keeps a REDUCED but non-zero influence; nothing
 *    is deleted. Fast results are tolerated much further (K_FAST = 2 × K_SLOW) so a genuine new
 *    best counts in full; only an implausibly fast outlier (e.g. a mistyped time far beyond the
 *    runner's other results) is down-weighted.
 *    Current Form = exp(mu), rounded to a second. It is never the single fastest result, and an
 *    old PB outside the horizon has no influence at all.
 * 5. MINIMUM DATA. 0 eligible → unavailable. 1 → "indicative" (its neutral value is reported
 *    for reference, but no Current Form). 2–3 → an estimate capped at Low confidence.
 * 6. CONFIDENCE (0–100, then High ≥ 75 / Medium ≥ 55 / Low ≥ 35 / Limited data): see
 *    `confidence` below. It describes the evidence for the estimate, never the chance of running
 *    that time. Stale data (latest eligible run older than STALE_DAYS) caps it at Low.
 * 7. TREND. Weighted least-squares slope of x against date (weights: course × robust, so an
 *    outlier cannot create a trend). Needs ≥ MIN_OBSERVATIONS runs over ≥ MIN_SPAN_DAYS. Change
 *    per 90 days beyond ±THRESHOLD AND |slope / standard error| ≥ MIN_T → improving / declining;
 *    otherwise stable. Raw clock times from different courses are never compared.
 *
 * Distance: V1 is 5000 m only. A future 10K/half/marathon form needs its own distance-specific
 * model (and distance-specific course factors); a 5K Current Form is never reused for them.
 */
import type {
  ConfidenceAssessment,
  ConfidenceFactor,
  ConfidenceLevel,
  FormTrendDirection,
  RunnerForm,
  RunnerFormExcludedPerformance,
  RunnerFormExclusion,
  RunnerFormInput,
} from '@runsaturday/shared';
import { daysBetween } from '../domain/confidence';
import { RUNNER_FORM_VERSION } from './versions';

export const RUNNER_FORM_V1 = {
  DISTANCE_METERS: 5000,
  /** Only performances from the last 180 days can inform Current Form. */
  HORIZON_DAYS: 180,
  /** Recency half-life: a run 45 days old counts half as much as one today, 90 days a quarter. */
  HALF_LIFE_DAYS: 45,
  /** Weight by Course Speed Factor confidence. Low / Limited factors are excluded. */
  COURSE_WEIGHT: { high: 1, medium: 0.75 } as Record<ConfidenceLevel, number | undefined>,
  robust: {
    /** Slow side: down-weight beyond 1.5 robust scale units. */
    K_SLOW: 1.5,
    /** Fast side: tolerate twice as far, so genuine improvement keeps full weight. */
    K_FAST: 3,
    /** Floor on the robust scale (log units ≈ 1%), so a very consistent runner is not over-fitted. */
    MIN_SCALE: 0.01,
    MAX_ITERATIONS: 100,
    TOLERANCE: 1e-10,
  },
  /** At most this many eligible runs → confidence capped at Low. */
  LOW_CAP_MAX_RUNS: 3,
  /** Latest eligible run older than this → confidence capped at Low. */
  STALE_DAYS: 90,
  confidence: {
    weights: { amount: 0.3, recency: 0.2, consistency: 0.2, course_factors: 0.15, events: 0.1, coverage: 0.05 },
    /** Effective number of runs (Kish) that earns full marks. */
    AMOUNT_FULL_AT: 8,
    RECENCY_FULL_DAYS: 14,
    RECENCY_ZERO_DAYS: 120,
    /** Robust spread (log units) for full marks / zero. */
    SPREAD_FULL_AT: 0.015,
    SPREAD_ZERO_AT: 0.06,
    EVENTS_FULL_AT: 3,
    COVERAGE_FULL_DAYS: 42,
    levels: { high: 75, medium: 55, low: 35 },
  },
  trend: {
    MIN_OBSERVATIONS: 4,
    MIN_SPAN_DAYS: 28,
    /** Change per 90 days (log units ≈ fraction) that counts as meaningful. */
    THRESHOLD: 0.015,
    PER_DAYS: 90,
    MIN_T: 2,
  },
} as const;

/** A performance as the model needs it. */
export interface FormPerformance {
  id: string;
  eventId: string | null;
  eventName: string;
  date: string;
  finishTimeSeconds: number;
  distanceMeters: number;
}

/** A Course Speed Factor as the model needs it. */
export interface FormCourseFactor {
  factor: number | null;
  confidence: { level: ConfidenceLevel; score: number };
}

const EXPLANATION: Record<RunnerFormExclusion, string> = {
  not_5k: 'Not a 5K: Current Form V1 uses 5000 m performances only.',
  future: 'Dated after today.',
  outside_horizon: `Older than ${RUNNER_FORM_V1.HORIZON_DAYS} days: history, not current form.`,
  course_not_modelled: 'Course not currently modelled by 5K Compass, so it cannot be course-normalised.',
  factor_unavailable: 'No Course Speed Factor for this event yet.',
  factor_low_confidence: 'Course Speed Factor confidence is too low to normalise this course.',
};

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const linear = (value: number, full: number, zero: number) => clamp((100 * (value - zero)) / (full - zero));

/** Weighted median (lower weighted median; deterministic). */
export function weightedMedian(values: readonly number[], weights: readonly number[]): number {
  const order = values.map((v, i) => ({ v, w: weights[i]! })).sort((a, b) => a.v - b.v);
  const total = order.reduce((s, o) => s + o.w, 0);
  let acc = 0;
  for (const o of order) {
    acc += o.w;
    if (acc >= total / 2) return o.v;
  }
  return order.at(-1)!.v;
}

function robustWeight(u: number): number {
  const { K_SLOW, K_FAST } = RUNNER_FORM_V1.robust;
  if (u > K_SLOW) return K_SLOW / u;
  if (u < -K_FAST) return K_FAST / -u;
  return 1;
}

/** Asymmetric weighted Huber M-estimate of the centre of x (see header). */
export function robustCentre(x: readonly number[], base: readonly number[]) {
  const { MIN_SCALE, MAX_ITERATIONS, TOLERANCE } = RUNNER_FORM_V1.robust;
  const start = weightedMedian(x, base);
  const scale = Math.max(MIN_SCALE, 1.4826 * weightedMedian(x.map((v) => Math.abs(v - start)), base));
  let mu = start;
  let robust = x.map(() => 1);
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    robust = x.map((v) => robustWeight((v - mu) / scale));
    const w = base.map((b, i) => b * robust[i]!);
    const next = w.reduce((s, wi, i) => s + wi * x[i]!, 0) / w.reduce((s, wi) => s + wi, 0);
    const done = Math.abs(next - mu) < TOLERANCE;
    mu = next;
    if (done) break;
  }
  robust = x.map((v) => robustWeight((v - mu) / scale));
  return { mu, scale, robust };
}

function levelOf(score: number): ConfidenceLevel {
  const { levels } = RUNNER_FORM_V1.confidence;
  return score >= levels.high ? 'high' : score >= levels.medium ? 'medium' : score >= levels.low ? 'low' : 'insufficient';
}

const capAtLow = (level: ConfidenceLevel): ConfidenceLevel => (level === 'high' || level === 'medium' ? 'low' : level);

const limited = (detail: string): ConfidenceAssessment => ({
  level: 'insufficient',
  score: 0,
  factors: [{ key: 'amount', label: 'Eligible performances', weight: 1, value: 0, detail }],
});

function trendOf(t: readonly number[], x: readonly number[], w: readonly number[]): RunnerForm['trend'] {
  const cfg = RUNNER_FORM_V1.trend;
  const n = x.length;
  const spanDays = n > 0 ? Math.round(Math.max(...t) - Math.min(...t)) : 0;
  const base = { observations: n, spanDays };
  if (n < cfg.MIN_OBSERVATIONS || spanDays < cfg.MIN_SPAN_DAYS) return { direction: 'limited', changePercentPer90Days: null, ...base };
  // Weights normalised to sum to n, so the residual variance has the usual degrees of freedom.
  const sw = w.reduce((s, v) => s + v, 0);
  const nw = w.map((v) => (v * n) / sw);
  const tBar = nw.reduce((s, v, i) => s + v * t[i]!, 0) / n;
  const xBar = nw.reduce((s, v, i) => s + v * x[i]!, 0) / n;
  const stt = nw.reduce((s, v, i) => s + v * (t[i]! - tBar) ** 2, 0);
  const slope = nw.reduce((s, v, i) => s + v * (t[i]! - tBar) * (x[i]! - xBar), 0) / stt;
  const rss = nw.reduce((s, v, i) => s + v * (x[i]! - xBar - slope * (t[i]! - tBar)) ** 2, 0);
  const se = Math.sqrt(rss / (n - 2) / stt);
  const change = slope * cfg.PER_DAYS;
  const significant = se === 0 ? change !== 0 : Math.abs(slope / se) >= cfg.MIN_T;
  let direction: FormTrendDirection = 'stable';
  if (significant && change <= -cfg.THRESHOLD) direction = 'improving';
  else if (significant && change >= cfg.THRESHOLD) direction = 'declining';
  return { direction, changePercentPer90Days: Math.round(change * 1000) / 10, ...base };
}

export function computeRunnerForm(
  performances: readonly FormPerformance[],
  factors: ReadonlyMap<string, FormCourseFactor>,
  asOfDate: string,
): RunnerForm {
  const cfg = RUNNER_FORM_V1;
  const excluded: RunnerFormExcludedPerformance[] = [];
  const eligible: (FormPerformance & { eventId: string; factor: FormCourseFactor & { factor: number }; ageDays: number })[] = [];
  const exclude = (p: FormPerformance, reason: RunnerFormExclusion) =>
    excluded.push({ performanceId: p.id, eventName: p.eventName, date: p.date, finishTimeSeconds: p.finishTimeSeconds, reason, explanation: EXPLANATION[reason] });

  for (const p of [...performances].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))) {
    const ageDays = daysBetween(p.date, asOfDate);
    if (p.distanceMeters !== cfg.DISTANCE_METERS) exclude(p, 'not_5k');
    else if (ageDays < 0) exclude(p, 'future');
    else if (ageDays >= cfg.HORIZON_DAYS) exclude(p, 'outside_horizon');
    else if (p.eventId == null) exclude(p, 'course_not_modelled');
    else {
      const f = factors.get(p.eventId);
      if (!f || f.factor == null) exclude(p, 'factor_unavailable');
      else if (cfg.COURSE_WEIGHT[f.confidence.level] == null) exclude(p, 'factor_low_confidence');
      else eligible.push({ ...p, eventId: p.eventId, factor: { ...f, factor: f.factor }, ageDays });
    }
  }

  const common = {
    version: RUNNER_FORM_VERSION,
    distanceMeters: cfg.DISTANCE_METERS,
    asOfDate,
    sampleSize: eligible.length,
    eventCount: new Set(eligible.map((e) => e.eventId)).size,
    lastPerformanceDate: eligible[0]?.date ?? null,
    excluded,
    method: { horizonDays: cfg.HORIZON_DAYS, halfLifeDays: cfg.HALF_LIFE_DAYS },
  };
  const noTrend = { direction: 'limited' as const, changePercentPer90Days: null, observations: eligible.length, spanDays: 0 };

  if (eligible.length === 0) {
    const reason = excluded.length === 0 ? 'No recorded 5K performances yet.' : `No eligible 5K performances in the last ${cfg.HORIZON_DAYS} days at courses 5K Compass models.`;
    return { ...common, status: 'unavailable', formSeconds: null, indicativeSeconds: null, confidence: limited(reason), trend: noTrend, limitedReason: reason, inputs: [] };
  }

  const x = eligible.map((e) => Math.log(e.finishTimeSeconds / e.factor.factor));
  const recency = eligible.map((e) => 0.5 ** (e.ageDays / cfg.HALF_LIFE_DAYS));
  const course = eligible.map((e) => cfg.COURSE_WEIGHT[e.factor.confidence.level]!);
  const base = recency.map((r, i) => r * course[i]!);
  const { mu, scale, robust } = robustCentre(x, base);
  const final = base.map((b, i) => b * robust[i]!);
  const total = final.reduce((s, v) => s + v, 0);
  const inputs: RunnerFormInput[] = eligible.map((e, i) => ({
    performanceId: e.id,
    eventId: e.eventId,
    eventName: e.eventName,
    date: e.date,
    ageDays: e.ageDays,
    actualSeconds: e.finishTimeSeconds,
    courseFactor: e.factor.factor,
    neutralSeconds: Math.round(Math.exp(x[i]!)),
    recencyWeight: round3(recency[i]!),
    courseWeight: course[i]!,
    robustWeight: round3(robust[i]!),
    share: round3(final[i]! / total),
  }));

  if (eligible.length === 1) {
    const reason = 'Only one eligible recent performance: shown for reference, not as Current Form.';
    return { ...common, status: 'indicative', formSeconds: null, indicativeSeconds: inputs[0]!.neutralSeconds, confidence: limited(reason), trend: noTrend, limitedReason: reason, inputs };
  }

  // Confidence in the estimate of underlying form.
  const c = cfg.confidence;
  const effectiveRuns = total ** 2 / final.reduce((s, v) => s + v * v, 0);
  const latestAge = eligible[0]!.ageDays;
  const spanDays = Math.max(...eligible.map((e) => e.ageDays)) - latestAge;
  const courseScore = eligible.reduce((s, e, i) => s + final[i]! * e.factor.confidence.score, 0) / total;
  const factorsList: ConfidenceFactor[] = [
    { key: 'amount', label: 'Recent performances', weight: c.weights.amount, value: Math.round(clamp((100 * effectiveRuns) / c.AMOUNT_FULL_AT)), detail: `${eligible.length} eligible runs, worth about ${effectiveRuns.toFixed(1)} after recency weighting (full marks at ${c.AMOUNT_FULL_AT})` },
    { key: 'recency', label: 'Recency', weight: c.weights.recency, value: Math.round(linear(latestAge, c.RECENCY_FULL_DAYS, c.RECENCY_ZERO_DAYS)), detail: `Latest eligible run ${latestAge} ${latestAge === 1 ? 'day' : 'days'} before ${asOfDate}` },
    { key: 'consistency', label: 'Consistency', weight: c.weights.consistency, value: Math.round(linear(scale, c.SPREAD_FULL_AT, c.SPREAD_ZERO_AT)), detail: `Typical spread of course-normalised times about ${(scale * 100).toFixed(1)}%` },
    { key: 'course_factors', label: 'Course factor confidence', weight: c.weights.course_factors, value: Math.round(courseScore), detail: 'Weighted confidence of the Course Speed Factors used to normalise each run' },
    { key: 'events', label: 'Different events', weight: c.weights.events, value: Math.round(clamp((100 * common.eventCount) / c.EVENTS_FULL_AT)), detail: `${common.eventCount} different ${common.eventCount === 1 ? 'event' : 'events'} (full marks at ${c.EVENTS_FULL_AT})` },
    { key: 'coverage', label: 'Time coverage', weight: c.weights.coverage, value: Math.round(clamp((100 * spanDays) / c.COVERAGE_FULL_DAYS)), detail: `Runs spread over ${spanDays} days (full marks at ${c.COVERAGE_FULL_DAYS})` },
  ];
  const score = Math.round(factorsList.reduce((s, f) => s + f.value * f.weight, 0));
  let level = levelOf(score);
  if (eligible.length <= cfg.LOW_CAP_MAX_RUNS || latestAge > cfg.STALE_DAYS) level = capAtLow(level);

  const trend = trendOf(
    eligible.map((e) => -e.ageDays),
    x,
    course.map((cw, i) => cw * robust[i]!),
  );
  const limitedReason =
    latestAge > cfg.STALE_DAYS
      ? `Latest eligible run is ${latestAge} days old, so Current Form may be out of date.`
      : eligible.length <= cfg.LOW_CAP_MAX_RUNS
        ? `Only ${eligible.length} eligible recent performances.`
        : null;

  return {
    ...common,
    status: 'estimate',
    formSeconds: Math.round(Math.exp(mu)),
    indicativeSeconds: null,
    confidence: { level, score, factors: factorsList },
    trend,
    limitedReason,
    inputs,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
