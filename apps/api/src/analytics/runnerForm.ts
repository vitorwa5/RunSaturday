/**
 * RUNNER FORM V1 (runner_form_v1): the runner's CURRENT 5K FORM. Pure and deterministic.
 *
 * DEFINITION. Current Form is the runner's current DEMONSTRATED 5K race capability: what their
 * strongest recent, repeated performances show they can run, adjusted for course differences. It
 * is NOT their typical recent parkrun finishing time: parkrun is often run easy, socially, while
 * pacing someone or with a buggy, so a "typical" time understates capability. It is also NOT the
 * single fastest result (one fast run is not form) and not a prediction of a future finish time.
 *
 * It is deliberately separate from the Overall 5K PB, the parkrun PB and the recent best: an old
 * PB is history, not current ability.
 *
 * 1. ELIGIBILITY. 5000 m performances dated within HORIZON_DAYS up to asOfDate, at a KNOWN
 *    internal event whose Course Speed Factor is at least Medium confidence. Everything else is
 *    listed as excluded with a reason, never silently used: other distances, unmodelled external
 *    courses (an unknown course is NOT given the reference factor 1.000), events without a
 *    factor and factors of Low/Limited confidence. A PB outside the horizon has zero influence.
 * 2. COURSE ADJUSTMENT. reference = actual ÷ course factor: the equivalent on the 5K Compass
 *    course-reference scale. Factors are centred on the eligible analysed cohort (geometric
 *    centre 1.000); this is a cohort reference, NOT a universal neutral 5K course. The model works
 *    in log space, x = ln(reference), so differences are ratios and mean the same for any runner.
 * 3. WEIGHTS. recency = 0.5^(ageDays / HALF_LIFE_DAYS) (smooth exponential decay, no buckets);
 *    course = by factor confidence (High 1.0, Medium 0.75); evidence b = recency × course.
 * 4. SUPPORTED PERFORMANCE FRONTIER (the estimator).
 *      window   for each run i, W_i = the runs whose x lies in [x_i, x_i + BAND] (BAND = 3%):
 *               run i plus the runs that AGREE with it from just slower
 *      support  S_i = Σ b over W_i (recent, well-normalised runs count more)
 *      anchor   the FASTEST run i whose window holds ≥ MIN_RUNS runs AND whose support is at
 *               least MIN_RELATIVE_SUPPORT × the best-supported window's support
 *      estimate Current Form = exp(Σ b·x / Σ b over the anchor's window), rounded to a second
 *    So faster recent runs are the evidence that matters; repeated near-fast runs reinforce each
 *    other; slower runs (outside the window) keep no weight in the estimate but stay listed; a
 *    single unsupported fast run (nothing within 3% of it) is not assumed and lowers confidence;
 *    two or more runs at a new, faster level move Current Form at once; and a faster cluster
 *    that is now much less supported than the current level (old, or one-off) does not hold
 *    Current Form up, so a genuine decline is followed too.
 *    If no two runs agree within BAND, the band widens once to WIDE_BAND (6%). If still none,
 *    the recency-weighted median of all eligible runs is used and confidence is capped at Low.
 *    Why this method: see `apps/api/src/__tests__/runnerFormCandidates.test.ts`, which compares
 *    it with a weighted median, the previous asymmetric Huber centre, a weighted 20th percentile
 *    and the single fastest run on deterministic fixtures (summarised in the README).
 * 5. MINIMUM DATA. 0 eligible → unavailable. 1 → "indicative" (its reference value is reported
 *    for reference, but no Current Form). 2–3 → an estimate capped at Low confidence.
 * 6. CONFIDENCE (0–100, then High ≥ 75 / Medium ≥ 55 / Low ≥ 35 / Limited data): see
 *    `confidence` below. It rests on the evidence AT THE FRONTIER: how many recent runs support
 *    it and how tightly they agree. Repeated similar fast runs raise it; an unsupported faster
 *    run lowers it; slower runs do not lower it when the frontier is consistently supported. It
 *    describes the evidence for the estimate, never the chance of running that time. Stale data
 *    (latest eligible run older than STALE_DAYS) caps it at Low.
 * 7. TREND. Course-weighted least-squares slope of x against date, over the frontier runs, any
 *    faster level they have replaced (so a genuine decline shows) and other runs within
 *    TREND_ZONE (6%) of Current Form (so far slower runs, which may be easy, social or paced, and
 *    a one-off fast run cannot manufacture a trend). Needs ≥ MIN_OBSERVATIONS
 *    runs over ≥ MIN_SPAN_DAYS. Change per 90 days beyond ±THRESHOLD AND |slope / standard error|
 *    ≥ MIN_T → improving / declining; otherwise stable. Raw clock times from different courses
 *    are never compared.
 *
 * FUTURE (not in V1; V1 works without it): optional effort metadata per performance (Hard/race,
 * Normal, Easy/social, Pacing, Buggy/stroller) and device evidence (Garmin/Strava heart rate,
 * splits) could exclude known easy efforts outright instead of relying on the frontier. V1 never
 * assumes a slow result was an easy run; it only gives slower results less influence when faster
 * performances are consistently demonstrated.
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
  RunnerFormInputRole,
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
  frontier: {
    /** Runs within 3% (log units) of a run, on its slower side, support it. */
    BAND: 0.03,
    /** Used once when no two runs agree within BAND. */
    WIDE_BAND: 0.06,
    /** A frontier needs at least this many agreeing runs. */
    MIN_RUNS: 2,
    /** …and at least this share of the best-supported window's (recency × course) support. */
    MIN_RELATIVE_SUPPORT: 0.25,
    /** Trend uses runs within this distance (log units) of Current Form: near-frontier evidence. */
    TREND_ZONE: 0.06,
  },
  /** At most this many eligible runs → confidence capped at Low. */
  LOW_CAP_MAX_RUNS: 3,
  /** Latest eligible run older than this → confidence capped at Low. */
  STALE_DAYS: 90,
  confidence: {
    weights: { amount: 0.25, support: 0.2, recency: 0.2, consistency: 0.15, course_factors: 0.1, events: 0.05, coverage: 0.05 },
    /** Effective number (Kish) of frontier runs that earns full marks. */
    AMOUNT_FULL_AT: 5,
    /** Frontier runs that earn full support marks. */
    SUPPORT_FULL_AT: 4,
    /** Support is multiplied by this when a faster run is not supported by any other. */
    UNSUPPORTED_FASTER_FACTOR: 0.5,
    /** Age of the latest frontier run: full marks / zero. */
    RECENCY_FULL_DAYS: 14,
    RECENCY_ZERO_DAYS: 120,
    /** Weighted spread of the frontier runs (log units): full marks / zero. */
    SPREAD_FULL_AT: 0.008,
    SPREAD_ZERO_AT: 0.025,
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

/** Midpoint of the lower and upper weighted medians (symmetric; deterministic). */
function weightedMedianMid(values: readonly number[], weights: readonly number[]): number {
  return (weightedMedian(values, weights) - weightedMedian(values.map((v) => -v), weights)) / 2;
}

export interface Frontier {
  /** Current Form in log space. */
  mu: number;
  /** Band actually used (log units), or null for the weighted-median fallback. */
  band: number | null;
  /** Role of each run (same order as x). */
  role: RunnerFormInputRole[];
  /** Weight of each run in the estimate (b for frontier runs, 0 otherwise). */
  weight: number[];
}

/** Supported performance frontier (see header, step 4). */
export function supportedFrontier(x: readonly number[], base: readonly number[]): Frontier {
  const { BAND, WIDE_BAND, MIN_RUNS, MIN_RELATIVE_SUPPORT } = RUNNER_FORM_V1.frontier;
  const order = x.map((_, i) => i).sort((a, b) => x[a]! - x[b]! || a - b);
  for (const band of [BAND, WIDE_BAND]) {
    const windows = order.map((i) => {
      const members = order.filter((j) => x[j]! >= x[i]! && x[j]! <= x[i]! + band + 1e-12);
      return { i, members, support: members.reduce((s, j) => s + base[j]!, 0) };
    });
    const supported = windows.filter((w) => w.members.length >= MIN_RUNS);
    if (supported.length === 0) continue;
    const best = Math.max(...supported.map((w) => w.support));
    const anchor = supported.find((w) => w.support >= MIN_RELATIVE_SUPPORT * best - 1e-12)!;
    const inside = new Set(anchor.members);
    const weight = x.map((_, j) => (inside.has(j) ? base[j]! : 0));
    const total = weight.reduce((s, w) => s + w, 0);
    const mu = weight.reduce((s, w, j) => s + w * x[j]!, 0) / total;
    // A faster run in a window of its own that agrees with others was outweighed (older or less
    // well normalised); one that agrees with no other run is unsupported.
    const agreed = new Set(supported.flatMap((w) => w.members));
    const role = x.map((v, j): RunnerFormInputRole =>
      inside.has(j) ? 'frontier' : v > x[anchor.i]! ? 'slower' : agreed.has(j) ? 'faster_outweighed' : 'faster_unsupported',
    );
    return { mu, band, role, weight };
  }
  return { mu: weightedMedianMid(x, base), band: null, role: x.map(() => 'frontier'), weight: [...base] };
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
    return { ...common, status: 'unavailable', formSeconds: null, indicativeSeconds: null, confidence: limited(reason), trend: noTrend, limitedReason: reason, inputs: [], frontier: null };
  }

  const x = eligible.map((e) => Math.log(e.finishTimeSeconds / e.factor.factor));
  const recency = eligible.map((e) => 0.5 ** (e.ageDays / cfg.HALF_LIFE_DAYS));
  const course = eligible.map((e) => cfg.COURSE_WEIGHT[e.factor.confidence.level]!);
  const base = recency.map((r, i) => r * course[i]!);
  const { mu, band, role, weight: final } = supportedFrontier(x, base);
  const total = final.reduce((s, v) => s + v, 0);
  const inputs: RunnerFormInput[] = eligible.map((e, i) => ({
    performanceId: e.id,
    eventId: e.eventId,
    eventName: e.eventName,
    date: e.date,
    ageDays: e.ageDays,
    actualSeconds: e.finishTimeSeconds,
    courseFactor: e.factor.factor,
    referenceSeconds: Math.round(Math.exp(x[i]!)),
    recencyWeight: round3(recency[i]!),
    courseWeight: course[i]!,
    role: role[i]!,
    share: round3(final[i]! / total),
  }));
  const frontierSummary: RunnerForm['frontier'] = {
    bandPercent: band == null ? null : Math.round(band * 100),
    supportingRuns: role.filter((r) => r === 'frontier').length,
    fasterUnsupportedRuns: role.filter((r) => r === 'faster_unsupported').length,
    fasterOutweighedRuns: role.filter((r) => r === 'faster_outweighed').length,
    slowerRuns: role.filter((r) => r === 'slower').length,
  };

  if (eligible.length === 1) {
    const reason = 'Only one eligible recent performance: shown for reference, not as Current Form.';
    return { ...common, status: 'indicative', formSeconds: null, indicativeSeconds: inputs[0]!.referenceSeconds, confidence: limited(reason), trend: noTrend, limitedReason: reason, inputs, frontier: frontierSummary };
  }

  // Confidence in the estimate, from the evidence at the frontier.
  const c = cfg.confidence;
  const members = eligible.map((_, i) => i).filter((i) => final[i]! > 0);
  const supportCount = members.length;
  const fasterCount = frontierSummary.fasterUnsupportedRuns;
  const effectiveRuns = total ** 2 / final.reduce((s, v) => s + v * v, 0);
  const spread = Math.sqrt(members.reduce((s, i) => s + final[i]! * (x[i]! - mu) ** 2, 0) / total);
  const frontierAges = members.map((i) => eligible[i]!.ageDays);
  const frontierLatest = Math.min(...frontierAges);
  const frontierSpan = Math.max(...frontierAges) - frontierLatest;
  const frontierEvents = new Set(members.map((i) => eligible[i]!.eventId)).size;
  const courseScore = members.reduce((s, i) => s + final[i]! * eligible[i]!.factor.confidence.score, 0) / total;
  const supportValue = clamp((100 * supportCount) / c.SUPPORT_FULL_AT) * (fasterCount > 0 ? c.UNSUPPORTED_FASTER_FACTOR : 1);
  const runs = (k: number) => `${k} ${k === 1 ? 'run' : 'runs'}`;
  const factorsList: ConfidenceFactor[] = [
    { key: 'amount', label: 'Recent supporting performances', weight: c.weights.amount, value: Math.round(clamp((100 * effectiveRuns) / c.AMOUNT_FULL_AT)), detail: `${runs(supportCount)} at your strongest supported level, worth about ${effectiveRuns.toFixed(1)} after recency weighting (full marks at ${c.AMOUNT_FULL_AT})` },
    {
      key: 'support',
      label: 'Frontier support',
      weight: c.weights.support,
      value: Math.round(supportValue),
      detail:
        `${runs(supportCount)} agree with your strongest level (full marks at ${c.SUPPORT_FULL_AT})` +
        (fasterCount > 0 ? `; ${runs(fasterCount)} faster but not repeated, so not assumed (support halved)` : '') +
        (frontierSummary.fasterOutweighedRuns > 0 ? `; ${runs(frontierSummary.fasterOutweighedRuns)} at a faster level that recent runs no longer support` : ''),
    },
    { key: 'recency', label: 'Recency', weight: c.weights.recency, value: Math.round(linear(frontierLatest, c.RECENCY_FULL_DAYS, c.RECENCY_ZERO_DAYS)), detail: `Latest supporting run ${frontierLatest} ${frontierLatest === 1 ? 'day' : 'days'} before ${asOfDate}` },
    { key: 'consistency', label: 'Consistency', weight: c.weights.consistency, value: Math.round(linear(spread, c.SPREAD_FULL_AT, c.SPREAD_ZERO_AT)), detail: `Supporting runs agree within about ${(spread * 100).toFixed(1)}% after course adjustment` },
    { key: 'course_factors', label: 'Course factor confidence', weight: c.weights.course_factors, value: Math.round(courseScore), detail: 'Weighted confidence of the Course Speed Factors used to normalise the supporting runs' },
    { key: 'events', label: 'Different events', weight: c.weights.events, value: Math.round(clamp((100 * frontierEvents) / c.EVENTS_FULL_AT)), detail: `Supporting runs at ${frontierEvents} different ${frontierEvents === 1 ? 'event' : 'events'} (full marks at ${c.EVENTS_FULL_AT})` },
    { key: 'coverage', label: 'Time coverage', weight: c.weights.coverage, value: Math.round(clamp((100 * frontierSpan) / c.COVERAGE_FULL_DAYS)), detail: `Supporting runs spread over ${frontierSpan} days (full marks at ${c.COVERAGE_FULL_DAYS})` },
  ];
  const score = Math.round(factorsList.reduce((s, f) => s + f.value * f.weight, 0));
  let level = levelOf(score);
  const latestAge = eligible[0]!.ageDays;
  // The newest evidence is a faster run nobody has repeated yet: at most Medium until it is.
  const newestUnsupported = eligible.some((e, i) => role[i] === 'faster_unsupported' && e.ageDays < frontierLatest);
  if (newestUnsupported) level = level === 'high' ? 'medium' : level;
  if (eligible.length <= cfg.LOW_CAP_MAX_RUNS || latestAge > cfg.STALE_DAYS || band == null) level = capAtLow(level);

  // Trend: course-weighted, over the frontier, any faster level it has replaced, and runs within
  // TREND_ZONE of it, so far slower runs (which may be easy, social or paced) and a one-off fast
  // run cannot manufacture a trend, while a genuine decline from a repeated faster level shows.
  const zone = eligible.map((_, i) => band == null || role[i] === 'faster_outweighed' || Math.abs(x[i]! - mu) <= cfg.frontier.TREND_ZONE + 1e-12);
  const near = eligible.map((_, i) => i).filter((i) => zone[i]);
  const trend = trendOf(
    near.map((i) => -eligible[i]!.ageDays),
    near.map((i) => x[i]!),
    near.map((i) => course[i]!),
  );
  const limitedReason =
    latestAge > cfg.STALE_DAYS
      ? `Latest eligible run is ${latestAge} days old, so Current Form may be out of date.`
      : eligible.length <= cfg.LOW_CAP_MAX_RUNS
        ? `Only ${eligible.length} eligible recent performances.`
        : band == null
          ? 'No two recent performances agree closely, so Current Form is a median of them.'
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
    frontier: frontierSummary,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
