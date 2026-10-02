/**
 * COURSE SPEED FACTOR V1 (course_speed_v1).
 *
 * Observed course speed from MATCHED RUNNERS: the same pseudonymous athlete at two events
 * within a short time of each other. Winner times, Competition Score, records and elevation
 * are NOT used. Factor 1.000 = the cohort's geometric centre; < 1 historically faster,
 * > 1 historically slower.
 *
 * 1. MATCHING (no pseudo-replication). For each athlete and each pair of events (A, B), all
 *    candidate run pairs within MAX_GAP_DAYS are sorted by (date gap, date A, date B) and
 *    matched greedily ONE-TO-ONE WITHOUT REPLACEMENT: no run is used twice within a pair.
 *    Each match gives y = ln(t_B / t_A) (a ratio, so it means the same for fast and slow
 *    runners) and a date-gap weight from GAP_BANDS. The total gap weight one athlete
 *    contributes to one event pair is capped at ATHLETE_PAIR_WEIGHT_CAP (scaled down
 *    proportionally), so frequent runners cannot dominate.
 * 2. MODEL. y ≈ θ_B − θ_A, with θ = ln(factor). Fitted jointly over the whole comparison
 *    network by iteratively reweighted least squares (IRLS) with HUBER weights on residuals:
 *    a comparison whose residual exceeds HUBER_K × robust scale (1.4826 × MAD of residuals)
 *    is down-weighted in proportion. Outliers are judged by DISAGREEMENT WITH THE MODEL,
 *    never by absolute slowness. The system is anchored with Σθ = 0 over fitted events, so
 *    the geometric mean factor is exactly 1.000.
 * 3. ELIGIBILITY. Events need MIN_MATCHED_RUNNERS distinct matched athletes and
 *    MIN_COMPARISONS comparisons (re-checked until stable) and must sit in the largest
 *    connected component of the comparison graph. Others get no factor (Limited data);
 *    there is NO fallback to elevation.
 * 4. UNCERTAINTY. A RUNNER-CLUSTER BOOTSTRAP refits the whole model BOOTSTRAP_REPLICATES
 *    times on athletes resampled with replacement (all of an athlete's comparisons move
 *    together), using deterministic seeds. Each event keeps its replicate log-factors, so a
 *    source→target ratio interval is taken per replicate (θ_t − θ_s), preserving the joint
 *    estimation's correlation. This describes uncertainty in the COURSE COMPARISON only, not
 *    an individual runner's day-to-day variation.
 */
import type { ConfidenceAssessment, ConfidenceFactor, ConfidenceLevel } from '@runsaturday/shared';
import { daysBetween } from '../domain/confidence';
import { median } from '../domain/statistics';
import { hashString, mulberry32 } from '../domain/random';
import { COURSE_SPEED_VERSION } from './versions';

export const COURSE_SPEED_V1 = {
  WINDOW_DAYS: 365,
  /** Date-gap bands: comparisons further apart get less weight; beyond the last band, none. */
  GAP_BANDS: [
    { maxDays: 14, weight: 1 },
    { maxDays: 28, weight: 0.8 },
    { maxDays: 56, weight: 0.5 },
    { maxDays: 90, weight: 0.25 },
  ],
  /** Maximum total gap weight one athlete contributes to one event pair. */
  ATHLETE_PAIR_WEIGHT_CAP: 3,
  HUBER_K: 1.345,
  MAX_ITERATIONS: 50,
  TOLERANCE: 1e-9,
  MIN_MATCHED_RUNNERS: 20,
  MIN_COMPARISONS: 40,
  BOOTSTRAP_REPLICATES: 200,
  /** Confidence weights (sum 1) and the counts that earn full marks. */
  confidence: {
    weights: { runners: 0.25, comparisons: 0.2, connectivity: 0.15, proximity: 0.15, dispersion: 0.15, recency: 0.1 },
    RUNNERS_FULL_AT: 60,
    COMPARISONS_FULL_AT: 150,
    NEIGHBOURS_FULL_AT: 3,
    /** Robust residual spread (log units) at which the dispersion factor reaches 0. */
    DISPERSION_ZERO_AT: 0.08,
    RECENCY_FULL_DAYS: 14,
    RECENCY_ZERO_DAYS: 120,
    /** Bootstrap spread (log units, 5th–95th half-width) that caps confidence at Low. */
    UNSTABLE_BOOTSTRAP_HALF_WIDTH: 0.02,
  },
  levels: { high: 75, medium: 55, low: 35 },
} as const;

export const MAX_GAP_DAYS = COURSE_SPEED_V1.GAP_BANDS.at(-1)!.maxDays;

/** One usable result with a pseudonymous athlete key. */
export interface PerformanceInput {
  athleteKey: string;
  eventId: string;
  date: string;
  seconds: number;
}

export interface Comparison {
  athleteKey: string;
  /** Lexicographically smaller event id. */
  a: string;
  b: string;
  /** ln(t_b / t_a). */
  y: number;
  gapDays: number;
  /** Gap weight after the per-athlete pair cap. */
  weight: number;
  latestDate: string;
}

export function gapWeight(gapDays: number): number {
  return COURSE_SPEED_V1.GAP_BANDS.find((b) => gapDays <= b.maxDays)?.weight ?? 0;
}

/** Step 1: one-to-one nearest-date matching without replacement, with the per-athlete cap. */
export function buildComparisons(performances: readonly PerformanceInput[]): Comparison[] {
  const byAthlete = new Map<string, Map<string, PerformanceInput[]>>();
  for (const p of performances) {
    const events = byAthlete.get(p.athleteKey) ?? new Map<string, PerformanceInput[]>();
    const runs = events.get(p.eventId) ?? [];
    runs.push(p);
    events.set(p.eventId, runs);
    byAthlete.set(p.athleteKey, events);
  }

  const comparisons: Comparison[] = [];
  for (const athleteKey of [...byAthlete.keys()].sort()) {
    const events = byAthlete.get(athleteKey)!;
    const ids = [...events.keys()].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const runsA = events.get(ids[i]!)!;
        const runsB = events.get(ids[j]!)!;
        const candidates: { ra: PerformanceInput; rb: PerformanceInput; gap: number }[] = [];
        for (const ra of runsA) {
          for (const rb of runsB) {
            const gap = Math.abs(daysBetween(ra.date, rb.date));
            if (gap <= MAX_GAP_DAYS) candidates.push({ ra, rb, gap });
          }
        }
        candidates.sort((x, y) => x.gap - y.gap || x.ra.date.localeCompare(y.ra.date) || x.rb.date.localeCompare(y.rb.date));
        const usedA = new Set<PerformanceInput>();
        const usedB = new Set<PerformanceInput>();
        const matched: Comparison[] = [];
        for (const c of candidates) {
          if (usedA.has(c.ra) || usedB.has(c.rb)) continue;
          usedA.add(c.ra);
          usedB.add(c.rb);
          matched.push({
            athleteKey,
            a: ids[i]!,
            b: ids[j]!,
            y: Math.log(c.rb.seconds / c.ra.seconds),
            gapDays: c.gap,
            weight: gapWeight(c.gap),
            latestDate: c.ra.date > c.rb.date ? c.ra.date : c.rb.date,
          });
        }
        const total = matched.reduce((s, m) => s + m.weight, 0);
        const scale = total > COURSE_SPEED_V1.ATHLETE_PAIR_WEIGHT_CAP ? COURSE_SPEED_V1.ATHLETE_PAIR_WEIGHT_CAP / total : 1;
        for (const m of matched) comparisons.push({ ...m, weight: m.weight * scale });
      }
    }
  }
  return comparisons;
}

/** Step 3: events with enough evidence, restricted to the largest connected component. */
export function eligibleEvents(comparisons: readonly Comparison[]): { events: string[]; comparisons: Comparison[] } {
  let current = [...comparisons];
  for (;;) {
    const runners = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const c of current) {
      for (const e of [c.a, c.b]) {
        counts.set(e, (counts.get(e) ?? 0) + 1);
        runners.set(e, (runners.get(e) ?? new Set()).add(c.athleteKey));
      }
    }
    const ok = new Set(
      [...counts.keys()].filter((e) => counts.get(e)! >= COURSE_SPEED_V1.MIN_COMPARISONS && runners.get(e)!.size >= COURSE_SPEED_V1.MIN_MATCHED_RUNNERS),
    );
    const next = current.filter((c) => ok.has(c.a) && ok.has(c.b));
    if (next.length === current.length) break;
    current = next;
  }

  // Largest connected component (ties: the one containing the smallest event id).
  const adjacency = new Map<string, Set<string>>();
  for (const c of current) {
    adjacency.set(c.a, (adjacency.get(c.a) ?? new Set()).add(c.b));
    adjacency.set(c.b, (adjacency.get(c.b) ?? new Set()).add(c.a));
  }
  const seen = new Set<string>();
  let best: string[] = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    while (stack.length) {
      const e = stack.pop()!;
      if (seen.has(e)) continue;
      seen.add(e);
      component.push(e);
      for (const n of adjacency.get(e) ?? []) stack.push(n);
    }
    if (component.length > best.length) best = component;
  }
  const members = new Set(best);
  return { events: [...best].sort(), comparisons: current.filter((c) => members.has(c.a) && members.has(c.b)) };
}

/** Solve A x = b by Gaussian elimination with partial pivoting (A is small and dense). */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

export interface FitResult {
  /** eventId → θ (log factor), Σθ = 0. */
  theta: Map<string, number>;
  /** Final robust weights (gap weight × Huber × multiplicity), aligned with the comparisons. */
  weights: number[];
  residuals: number[];
  /** Robust residual scale (1.4826 × MAD). */
  scale: number;
}

/** Median of a typed array (sorts a copy). */
function typedMedian(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Comparisons pre-indexed for fast repeated fitting. */
interface PreparedComparisons {
  n: number;
  ia: Int32Array;
  ib: Int32Array;
  y: Float64Array;
  weight: Float64Array;
  athlete: Int32Array;
}

function prepare(events: readonly string[], comparisons: readonly Comparison[], athletes: readonly string[]): PreparedComparisons {
  const eventIndex = new Map(events.map((e, i) => [e, i]));
  const athleteIndex = new Map(athletes.map((a, i) => [a, i]));
  const m = comparisons.length;
  const p: PreparedComparisons = {
    n: events.length,
    ia: new Int32Array(m),
    ib: new Int32Array(m),
    y: new Float64Array(m),
    weight: new Float64Array(m),
    athlete: new Int32Array(m),
  };
  comparisons.forEach((c, k) => {
    p.ia[k] = eventIndex.get(c.a)!;
    p.ib[k] = eventIndex.get(c.b)!;
    p.y[k] = c.y;
    p.weight[k] = c.weight;
    p.athlete[k] = athleteIndex.get(c.athleteKey)!;
  });
  return p;
}

export interface FitResult {
  /** eventId → θ (log factor), Σθ = 0. */
  theta: Map<string, number>;
  /** Final robust weights (gap weight × Huber × multiplicity), aligned with the comparisons. */
  weights: number[];
  residuals: number[];
  /** Robust residual scale (1.4826 × MAD). */
  scale: number;
}

/**
 * IRLS core on prepared comparisons. `multiplicity[athlete]` (bootstrap) multiplies weights;
 * `start` warm-starts θ (only affects speed, not the converged answer). Returns null if any
 * event carries no weight (θ unidentified) or the system is singular.
 */
function irls(p: PreparedComparisons, multiplicity: Float64Array | null, start: Float64Array | null) {
  const { n, ia, ib, y, weight } = p;
  const m = y.length;
  const base = new Float64Array(m);
  for (let k = 0; k < m; k++) base[k] = weight[k]! * (multiplicity ? multiplicity[p.athlete[k]!]! : 1);
  const huber = new Float64Array(m).fill(1);
  const residuals = new Float64Array(m);
  let theta = start ? Float64Array.from(start) : new Float64Array(n);
  let scale = 0;
  const activeCount = base.reduce((c, w) => c + (w > 0 ? 1 : 0), 0);
  const active = new Float64Array(activeCount);

  for (let iter = 0; iter < COURSE_SPEED_V1.MAX_ITERATIONS; iter++) {
    if (iter > 0 || start) {
      // Residuals and Huber weights from the current θ.
      let j = 0;
      for (let k = 0; k < m; k++) {
        residuals[k] = y[k]! - (theta[ib[k]!]! - theta[ia[k]!]!);
        if (base[k]! > 0) active[j++] = residuals[k]!;
      }
      const center = typedMedian(active);
      for (let k = 0; k < activeCount; k++) active[k] = Math.abs(active[k]! - center);
      scale = 1.4826 * typedMedian(active) || 1e-6;
      const limit = COURSE_SPEED_V1.HUBER_K * scale;
      for (let k = 0; k < m; k++) {
        const a = Math.abs(residuals[k]!);
        huber[k] = a <= limit ? 1 : limit / a;
      }
    }
    // Normal equations of Σ w (y − θb + θa)², anchored by Σθ = 0 via (L + J) θ = r.
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(1));
    const r = new Array<number>(n).fill(0);
    for (let k = 0; k < m; k++) {
      const w = base[k]! * huber[k]!;
      if (w === 0) continue;
      const a = ia[k]!;
      const b = ib[k]!;
      A[a]![a]! += w;
      A[b]![b]! += w;
      A[a]![b]! -= w;
      A[b]![a]! -= w;
      r[b]! += w * y[k]!;
      r[a]! -= w * y[k]!;
    }
    for (let i = 0; i < n; i++) if (A[i]![i]! - 1 <= 1e-12) return null;
    const next = solve(A, r);
    if (!next) return null;
    let change = 0;
    for (let i = 0; i < n; i++) change = Math.max(change, Math.abs(next[i]! - theta[i]!));
    theta = Float64Array.from(next);
    if (iter > 0 && change < COURSE_SPEED_V1.TOLERANCE) break;
  }
  for (let k = 0; k < m; k++) residuals[k] = y[k]! - (theta[ib[k]!]! - theta[ia[k]!]!);
  const weights = new Float64Array(m);
  for (let k = 0; k < m; k++) weights[k] = base[k]! * huber[k]!;
  return { theta, residuals, weights, scale };
}

/**
 * Step 2: weighted robust fit (Huber IRLS). `multiplicity` (bootstrap) multiplies an
 * athlete's weights. Returns null if the weighted graph is not connected (singular system).
 */
export function fitFactors(events: readonly string[], comparisons: readonly Comparison[], multiplicity?: ReadonlyMap<string, number>): FitResult | null {
  const athletes = [...new Set(comparisons.map((c) => c.athleteKey))].sort();
  const p = prepare(events, comparisons, athletes);
  const mult = multiplicity ? Float64Array.from(athletes.map((a) => multiplicity.get(a) ?? 0)) : null;
  const out = irls(p, mult, null);
  if (!out) return null;
  return {
    theta: new Map(events.map((e, i) => [e, out.theta[i]!])),
    weights: Array.from(out.weights),
    residuals: Array.from(out.residuals),
    scale: out.scale,
  };
}

export interface CourseFactorResult {
  eventId: string;
  version: string;
  asOfDate: string;
  windowDays: number;
  /** exp(θ); null when the event is not fitted (Limited data). */
  factor: number | null;
  logFactor: number | null;
  /** Replicate log-factors from the runner bootstrap, index-aligned across events. */
  bootstrap: number[];
  matchedRunners: number;
  comparisons: number;
  connectedEvents: number;
  medianGapDays: number | null;
  /** Robust residual spread of this event's comparisons (log units ≈ fraction). */
  dispersion: number | null;
  /** Half-width of the 5th–95th bootstrap interval of θ (log units). */
  bootstrapHalfWidth: number | null;
  latestComparison: string | null;
  confidence: ConfidenceAssessment;
  /** Why the factor is unavailable, when it is. */
  limitedReason: string | null;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Nearest-rank percentile of sorted finite values. */
export function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

function levelOf(score: number): ConfidenceLevel {
  const { levels } = COURSE_SPEED_V1;
  return score >= levels.high ? 'high' : score >= levels.medium ? 'medium' : score >= levels.low ? 'low' : 'insufficient';
}

function factorConfidence(stats: {
  runners: number;
  comparisons: number;
  neighbours: number;
  proximity: number;
  dispersion: number;
  latest: string;
  asOfDate: string;
  bootstrapHalfWidth: number;
}): ConfidenceAssessment {
  const c = COURSE_SPEED_V1.confidence;
  const age = daysBetween(stats.latest, stats.asOfDate);
  const factors: ConfidenceFactor[] = [
    { key: 'matched_runners', label: 'Matched runners', weight: c.weights.runners, value: Math.round(clamp((100 * stats.runners) / c.RUNNERS_FULL_AT)), detail: `${stats.runners} runners also ran at other events (full marks at ${c.RUNNERS_FULL_AT})` },
    { key: 'comparisons', label: 'Matched comparisons', weight: c.weights.comparisons, value: Math.round(clamp((100 * stats.comparisons) / c.COMPARISONS_FULL_AT)), detail: `${stats.comparisons} one-to-one comparisons (full marks at ${c.COMPARISONS_FULL_AT})` },
    { key: 'connectivity', label: 'Connectivity', weight: c.weights.connectivity, value: Math.round(clamp((100 * stats.neighbours) / c.NEIGHBOURS_FULL_AT)), detail: `Directly compared with ${stats.neighbours} other ${stats.neighbours === 1 ? 'event' : 'events'}` },
    { key: 'proximity', label: 'Date proximity', weight: c.weights.proximity, value: Math.round(clamp(100 * stats.proximity)), detail: 'Average date-gap weight of the comparisons' },
    { key: 'agreement', label: 'Model agreement', weight: c.weights.dispersion, value: Math.round(clamp(100 * (1 - stats.dispersion / c.DISPERSION_ZERO_AT))), detail: `Typical disagreement with the model ${(stats.dispersion * 100).toFixed(1)}%` },
    {
      key: 'recency',
      label: 'Recency',
      weight: c.weights.recency,
      value: Math.round(clamp(100 * (1 - Math.max(0, age - c.RECENCY_FULL_DAYS) / (c.RECENCY_ZERO_DAYS - c.RECENCY_FULL_DAYS)))),
      detail: `Latest comparison ${age} ${age === 1 ? 'day' : 'days'} before ${stats.asOfDate}`,
    },
  ];
  const score = Math.round(factors.reduce((s, f) => s + f.value * f.weight, 0));
  let level = levelOf(score);
  // An unstable bootstrap can never be more than Low.
  if (stats.bootstrapHalfWidth > c.UNSTABLE_BOOTSTRAP_HALF_WIDTH && (level === 'high' || level === 'medium')) level = 'low';
  return { level, score, factors };
}

const limitedConfidence = (detail: string): ConfidenceAssessment => ({
  level: 'insufficient',
  score: 0,
  factors: [{ key: 'matched_runners', label: 'Matched runners', weight: 1, value: 0, detail }],
});

/**
 * Course Speed Factor V1 for every event. `performances` must already be limited to usable
 * occurrences in the window. Deterministic for a given input set (inputs are sorted).
 */
export function computeCourseFactors(
  eventIds: readonly string[],
  performances: readonly PerformanceInput[],
  options: { asOfDate: string; windowDays?: number; replicates?: number },
): CourseFactorResult[] {
  const sorted = [...performances].sort(
    (x, y) => x.athleteKey.localeCompare(y.athleteKey) || x.eventId.localeCompare(y.eventId) || x.date.localeCompare(y.date) || x.seconds - y.seconds,
  );
  const all = buildComparisons(sorted);
  const { events, comparisons } = eligibleEvents(all);
  const fit = events.length >= 2 ? fitFactors(events, comparisons) : null;

  // Runner-cluster bootstrap: resample athletes with replacement, refit, keep replicate θ.
  const replicates = options.replicates ?? COURSE_SPEED_V1.BOOTSTRAP_REPLICATES;
  const athletes = [...new Set(comparisons.map((c) => c.athleteKey))].sort();
  const draws = new Map<string, number[]>(events.map((e) => [e, []]));
  if (fit) {
    const prepared = prepare(events, comparisons, athletes);
    const warm = Float64Array.from(events.map((e) => fit.theta.get(e)!));
    const multiplicity = new Float64Array(athletes.length);
    for (let b = 0; b < replicates; b++) {
      const rand = mulberry32(hashString(`course-speed-bootstrap|${b}`));
      multiplicity.fill(0);
      for (let i = 0; i < athletes.length; i++) multiplicity[Math.floor(rand() * athletes.length)]! += 1;
      const rep = irls(prepared, multiplicity, warm);
      // A replicate either fits every event or none, so dropping failures keeps replicate
      // indices aligned across events (needed for per-replicate ratios).
      if (rep) events.forEach((e, i) => draws.get(e)!.push(rep.theta[i]!));
    }
  }

  return [...eventIds].sort().map((eventId) => {
    const base = {
      eventId,
      version: COURSE_SPEED_VERSION,
      asOfDate: options.asOfDate,
      windowDays: options.windowDays ?? COURSE_SPEED_V1.WINDOW_DAYS,
    };
    const involving = all.filter((c) => c.a === eventId || c.b === eventId);
    const runners = new Set(involving.map((c) => c.athleteKey)).size;
    if (!fit || !fit.theta.has(eventId)) {
      const reason =
        involving.length === 0
          ? 'No matched runners: nobody with a result here also ran at another analysed event.'
          : runners < COURSE_SPEED_V1.MIN_MATCHED_RUNNERS || involving.length < COURSE_SPEED_V1.MIN_COMPARISONS
            ? `Too few matched runners (${runners} runners, ${involving.length} comparisons; needs ${COURSE_SPEED_V1.MIN_MATCHED_RUNNERS} and ${COURSE_SPEED_V1.MIN_COMPARISONS}).`
            : 'Not connected to the main comparison network.';
      return {
        ...base,
        factor: null,
        logFactor: null,
        bootstrap: [],
        matchedRunners: runners,
        comparisons: involving.length,
        connectedEvents: new Set(involving.map((c) => (c.a === eventId ? c.b : c.a))).size,
        medianGapDays: median(involving.map((c) => c.gapDays)),
        dispersion: null,
        bootstrapHalfWidth: null,
        latestComparison: involving.reduce<string | null>((acc, c) => (acc == null || c.latestDate > acc ? c.latestDate : acc), null),
        confidence: limitedConfidence(reason),
        limitedReason: reason,
      } satisfies CourseFactorResult;
    }

    const idx = comparisons.map((c, k) => (c.a === eventId || c.b === eventId ? k : -1)).filter((k) => k >= 0);
    const own = idx.map((k) => comparisons[k]!);
    const res = idx.map((k) => fit.residuals[k]!);
    const center = median(res) ?? 0;
    const dispersion = 1.4826 * (median(res.map((v) => Math.abs(v - center))) ?? 0);
    const proximity = own.reduce((s, c) => s + gapWeight(c.gapDays), 0) / own.length;
    const latest = own.reduce((acc, c) => (c.latestDate > acc ? c.latestDate : acc), own[0]!.latestDate);
    const theta = fit.theta.get(eventId)!;
    const reps = draws.get(eventId)!;
    const finite = reps.filter(Number.isFinite).sort((a, b) => a - b);
    const halfWidth = finite.length >= 20 ? (percentile(finite, 0.95) - percentile(finite, 0.05)) / 2 : Number.POSITIVE_INFINITY;
    const ownRunners = new Set(own.map((c) => c.athleteKey)).size;
    const neighbours = new Set(own.map((c) => (c.a === eventId ? c.b : c.a))).size;

    return {
      ...base,
      factor: Math.exp(theta),
      logFactor: theta,
      bootstrap: reps,
      matchedRunners: ownRunners,
      comparisons: own.length,
      connectedEvents: neighbours,
      medianGapDays: median(own.map((c) => c.gapDays)),
      dispersion,
      bootstrapHalfWidth: Number.isFinite(halfWidth) ? halfWidth : null,
      latestComparison: latest,
      confidence: factorConfidence({ runners: ownRunners, comparisons: own.length, neighbours, proximity, dispersion, latest, asOfDate: options.asOfDate, bootstrapHalfWidth: halfWidth }),
      limitedReason: null,
    } satisfies CourseFactorResult;
  });
}

/**
 * Bootstrap interval (5th–95th percentile) of the source→target log ratio, taken per
 * replicate so the factors' joint estimation is respected. Null when too few replicates.
 */
export function ratioInterval(source: CourseFactorResult, target: CourseFactorResult): { low: number; high: number; replicates: number } | null {
  const diffs: number[] = [];
  const n = Math.min(source.bootstrap.length, target.bootstrap.length);
  for (let b = 0; b < n; b++) {
    const d = target.bootstrap[b]! - source.bootstrap[b]!;
    if (Number.isFinite(d)) diffs.push(d);
  }
  if (diffs.length < 20) return null;
  diffs.sort((a, b) => a - b);
  return { low: Math.exp(percentile(diffs, 0.05)), high: Math.exp(percentile(diffs, 0.95)), replicates: diffs.length };
}
