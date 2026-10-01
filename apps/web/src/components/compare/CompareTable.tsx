import type { CompareMetricKey, CompareResponse } from '@runsaturday/shared';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CONFIDENCE_SHORT, formatCount, formatDifficulty, formatPlacementRange, formatScore, SURFACE_LABEL } from '../../lib/display';
import { DemoBadge } from '../ui/DemoBadge';

type Row = CompareResponse['events'][number];

interface MetricRow {
  label: string;
  best?: CompareMetricKey;
  hint?: string;
  render: (r: Row) => ReactNode;
}

const BASE_ROWS: MetricRow[] = [
  { label: 'Demo PB Score', best: 'pb_score', render: (r) => `${formatScore(r.event.scores?.pbScore)}/100` },
  { label: 'Difficulty', best: 'difficulty', render: (r) => `${formatDifficulty(r.event.scores?.difficultyScore)}/10` },
  { label: 'Competition', render: (r) => (r.event.scores?.competitionScore == null ? 'Limited data' : `${formatScore(r.event.scores.competitionScore)}/100`) },
  { label: 'Avg runners', render: (r) => formatCount(r.event.averageParticipants) },
  { label: 'Elevation', best: 'elevation', render: (r) => (r.event.elevationM == null ? 'Unknown' : `${r.event.elevationM} m`) },
  { label: 'Surface', render: (r) => SURFACE_LABEL[r.event.surface] },
  { label: 'Est. travel', best: 'travel', render: (r) => (r.event.travel ? `~${r.event.travel.minutes} min` : '—') },
  { label: 'Confidence', render: (r) => (r.event.scores ? CONFIDENCE_SHORT[r.event.scores.pbConfidence] : 'Limited data') },
];

const PLACEMENT_ROWS: MetricRow[] = [
  {
    label: 'Median position',
    best: 'median_placement',
    render: (r) => (r.placement?.stats ? formatPlacementRange(r.placement.stats.medianPlacement) : 'No data'),
  },
  {
    label: 'Top 10 historically',
    best: 'top10',
    render: (r) => {
      const f = r.placement?.stats?.frequencies.top10;
      return f ? `${f.count} of ${f.of}` : 'No data';
    },
  },
  {
    label: 'Placement data',
    render: (r) => (r.placement ? `${CONFIDENCE_SHORT[r.placement.confidence]} · ${r.placement.sampleSize} events` : '—'),
  },
];

/**
 * Comparison table. Event columns scroll horizontally inside the card while the metric
 * labels stay pinned, so the page itself never scrolls sideways. "Best" is marked with an
 * icon and text, not colour alone.
 */
export function CompareTable({ data }: { data: CompareResponse }) {
  const rows = [...BASE_ROWS, ...(data.timeSeconds != null ? PLACEMENT_ROWS : [])];
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="overflow-x-auto" role="region" aria-label="Comparison table, scroll sideways for more events" tabIndex={0}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Event comparison. The best value in a row is marked “Best”.</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-28 min-w-28 border-b border-line bg-surface px-3 py-3 text-left text-xs font-semibold text-muted">
                Metric
              </th>
              {data.events.map((r) => (
                <th key={r.event.id} scope="col" className="min-w-36 border-b border-line px-3 py-3 text-left align-top">
                  <Link to={`/event/${r.event.id}`} className="font-bold leading-tight text-ink underline-offset-2 hover:underline">
                    {r.event.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-1 text-xs font-normal text-subtle">
                    {r.event.town}
                    {r.event.source === 'demo' && <DemoBadge />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 1 ? 'bg-canvas/60' : ''}>
                <th scope="row" className={`sticky left-0 z-10 px-3 py-2.5 text-left align-top text-xs font-semibold text-muted ${i % 2 === 1 ? 'bg-[#fbfbfa]' : 'bg-surface'}`}>
                  {row.label}
                </th>
                {data.events.map((r) => {
                  const isBest = row.best != null && (data.best[row.best] ?? []).includes(r.event.id);
                  return (
                    <td key={r.event.id} className="px-3 py-2.5 align-top tabular-nums">
                      <span className={`block ${isBest ? 'font-bold text-ink' : 'text-ink'}`}>{row.render(r)}</span>
                      {isBest && (
                        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-positive-bg px-1.5 py-0.5 text-[10px] font-bold text-positive">
                          <Star className="size-2.5 fill-current" aria-hidden />
                          Best
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
