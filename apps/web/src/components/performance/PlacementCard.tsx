import { formatShortDate, ordinal, PLACEMENT_TARGETS, type EventPlacement, type PlacementTargetId } from '@runsaturday/shared';
import { Car, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { formatFrequency, formatPlacementRange, formatScore } from '../../lib/display';
import { AlertBanner } from '../ui/AlertBanner';
import { Button, ButtonLink } from '../ui/Button';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { DemoBadge } from '../ui/DemoBadge';

/** One event's historical placement for a runner time. Leads with typical position and target frequency. */
export function PlacementCard({ placement, target }: { placement: EventPlacement; target: PlacementTargetId }) {
  const { event, stats, sampleSize, confidence, history } = placement;
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();
  const targetLabel = PLACEMENT_TARGETS.find((t) => t.id === target)!.label;
  if (!stats) return null;
  const limited = confidence === 'insufficient';

  return (
    <article aria-label={event.name} className="rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_4px_rgba(24,24,27,0.05)]">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg leading-tight font-bold">{event.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {event.town && <span>{event.town}</span>}
            {event.travel && (
              <span className="inline-flex items-center gap-1" title="Estimated from straight-line distance">
                <Car className="size-3.5" aria-hidden />~{event.travel.minutes} min estimated travel
              </span>
            )}
          </p>
        </div>
        {event.source === 'demo' && <DemoBadge />}
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Typical position</dt>
          <dd className="mt-0.5 text-2xl font-extrabold tracking-tight tabular-nums">{formatPlacementRange(stats.typicalRange)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{targetLabel} historically</dt>
          <dd className="mt-0.5 text-2xl font-extrabold tracking-tight tabular-nums">
            {placement.target ? `${placement.target.count} / ${placement.target.of}` : '—'}
          </dd>
          <dd className="text-xs text-subtle">events</dd>
        </div>
      </dl>

      <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted">Median</dt>
          <dd className="font-bold">{formatPlacementRange(stats.medianPlacement)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Best</dt>
          <dd className="font-bold">{ordinal(stats.bestPlacement)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Competition</dt>
          <dd className="font-bold tabular-nums">{formatScore(event.scores?.competitionScore)}/100</dd>
        </div>
        <div>
          <dt className="sr-only">Confidence</dt>
          <dd>
            <ConfidenceBadge level={confidence} sampleSize={sampleSize} compact />
          </dd>
        </div>
      </dl>

      {limited && (
        <div className="mt-3">
          <AlertBanner tone="caution" title={`Not enough data (${sampleSize} ${sampleSize === 1 ? 'event' : 'events'})`}>
            Treat these positions as a rough guide only.
          </AlertBanner>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ButtonLink to={`/event/${event.id}`} variant="secondary" className="min-h-10">
          View event
        </ButtonLink>
        <Button variant="secondary" className="min-h-10" aria-expanded={showHistory} aria-controls={historyId} onClick={() => setShowHistory((v) => !v)}>
          History
          <ChevronDown className={`size-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} aria-hidden />
        </Button>
      </div>
      <div id={historyId} hidden={!showHistory} className="mt-3 rounded-2xl bg-canvas p-3">
        <h4 className="mb-2 text-sm font-semibold">Historically, this time would have placed</h4>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
          {history.map((h) => (
            <li key={h.date} className="flex justify-between gap-2">
              <span className="text-muted">{formatShortDate(h.date)}</span>
              <span className="font-semibold">
                {formatPlacementRange({ low: h.best, high: h.worst })} <span className="font-normal text-subtle">of {h.fieldSize + 1}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-subtle">
          Top 10 in {formatFrequency(stats.frequencies.top10)}. Showing the {history.length} most recent.
          {history.some((h) => h.best !== h.worst) && ' A range means others recorded exactly the same time, so the exact placing is unknown.'}
        </p>
      </div>
    </article>
  );
}
