/** Event comparison: which event is most favourable on each comparable metric. */
import type { CompareMetricKey, CompareResponse, EventPlacement, EventSummary } from '@runsaturday/shared';

type Row = { event: EventSummary; placement: EventPlacement | null };

/**
 * Metrics with a clear "better" direction. Competition and field size are deliberately
 * absent: lower competition is not universally better, it depends on the runner's goal.
 */
const METRICS: { key: CompareMetricKey; value: (r: Row) => number | null; better: 'higher' | 'lower' }[] = [
  { key: 'pb_score', value: (r) => r.event.scores?.pbScore ?? null, better: 'higher' },
  { key: 'difficulty', value: (r) => r.event.scores?.difficultyScore ?? null, better: 'lower' },
  { key: 'elevation', value: (r) => r.event.elevationM, better: 'lower' },
  { key: 'travel', value: (r) => r.event.travel?.minutes ?? null, better: 'lower' },
  { key: 'median_placement', value: (r) => (r.placement?.confidence !== 'insufficient' ? (r.placement?.stats?.medianPlacement ?? null) : null), better: 'lower' },
  {
    key: 'top10',
    value: (r) => {
      const f = r.placement?.stats?.frequencies.top10;
      return f && f.of > 0 && r.placement?.confidence !== 'insufficient' ? f.count / f.of : null;
    },
    better: 'higher',
  },
];

/** Ids of the best event(s) per metric; a metric is only marked when 2+ events have a value and they differ. */
export function bestByMetric(rows: Row[]): CompareResponse['best'] {
  const best: CompareResponse['best'] = {};
  for (const m of METRICS) {
    const valued = rows.map((r) => ({ id: r.event.id, v: m.value(r) })).filter((x): x is { id: string; v: number } => x.v != null);
    if (valued.length < 2) continue;
    const target = m.better === 'higher' ? Math.max(...valued.map((x) => x.v)) : Math.min(...valued.map((x) => x.v));
    if (valued.every((x) => x.v === target)) continue;
    best[m.key] = valued.filter((x) => x.v === target).map((x) => x.id);
  }
  return best;
}
