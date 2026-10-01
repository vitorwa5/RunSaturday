import type { Recommendation } from '@runsaturday/shared';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { formatCount, formatScore, opportunityBand, SURFACE_LABEL } from '../../lib/display';
import { Button, ButtonLink } from '../ui/Button';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { DemoBadge } from '../ui/DemoBadge';
import { TONE_CLASSES } from '../ui/tone';
import { ReasonList } from './ReasonList';

interface BestPickCardProps {
  recommendation: Recommendation;
  /** How the pick was ranked, shown under "Why this?". */
  method: string;
}

export function BestPickCard({ recommendation, method }: BestPickCardProps) {
  const { event, rankedBy, reasons } = recommendation;
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();
  const pbBand = opportunityBand(event.scores?.pbScore);
  // When the pick is ranked by PB Score, the second tile shows field size instead of repeating it.
  const rankedByPb = rankedBy.label === 'PB Score';
  // Short summary: positive reasons not already shown in the tiles above.
  const headline = reasons
    .filter((r) => r.tone === 'positive' && !r.text.startsWith(rankedBy.label) && !r.text.startsWith('PB Score') && !r.text.startsWith('About'))
    .slice(0, 2)
    .map((r) => r.text);

  return (
    <section aria-label="Your best pick" className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <div className="border-b border-brand-100 bg-brand-50 px-4 py-2">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-brand-800 uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          Your best pick
        </p>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-bold">{event.name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {[event.town, SURFACE_LABEL[event.surface], event.elevationM != null ? `${event.elevationM} m elevation` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {event.source === 'demo' && <DemoBadge />}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-canvas p-2">
            <dt className="text-[11px] font-semibold text-muted uppercase">{rankedBy.label}</dt>
            <dd className="text-2xl font-bold tabular-nums">
              {rankedBy.value == null ? '—' : Math.round(rankedBy.value)}
              {rankedBy.unit && <span className="ml-0.5 text-xs font-medium text-subtle">{rankedBy.unit}</span>}
            </dd>
            {rankedByPb && (
              <dd className={`mx-auto mt-0.5 w-fit rounded-full px-2 text-[10px] font-semibold ${TONE_CLASSES[pbBand.tone]}`}>
                {pbBand.label}
              </dd>
            )}
          </div>
          {rankedByPb ? (
            <div className="rounded-2xl bg-canvas p-2">
              <dt className="text-[11px] font-semibold text-muted uppercase">Avg runners</dt>
              <dd className="text-2xl font-bold tabular-nums">{formatCount(event.averageParticipants)}</dd>
            </div>
          ) : (
            <div className="rounded-2xl bg-canvas p-2">
              <dt className="text-[11px] font-semibold text-muted uppercase">PB Score</dt>
              <dd className="text-2xl font-bold tabular-nums">{formatScore(event.scores?.pbScore)}</dd>
              <dd className={`mx-auto mt-0.5 w-fit rounded-full px-2 text-[10px] font-semibold ${TONE_CLASSES[pbBand.tone]}`}>
                {pbBand.label}
              </dd>
            </div>
          )}
          <div className="rounded-2xl bg-canvas p-2">
            <dt className="text-[11px] font-semibold text-muted uppercase">Travel</dt>
            <dd className="text-2xl font-bold tabular-nums">
              {event.travel ? `~${event.travel.minutes}` : '—'}
              <span className="ml-0.5 text-xs font-medium text-subtle">min</span>
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {event.scores && (
            <ConfidenceBadge level={event.scores.pbConfidence} sampleSize={event.scores.sampleSize} windowDays={event.scores.windowDays} />
          )}
        </div>

        {headline.length > 0 && <p className="mt-3 text-sm font-medium text-ink">{headline.join(' · ')}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <ButtonLink to={`/event/${event.id}`}>View event</ButtonLink>
          <Button variant="secondary" aria-expanded={showWhy} aria-controls={whyId} onClick={() => setShowWhy((v) => !v)}>
            Why this?
            <ChevronDown className={`size-4 transition-transform ${showWhy ? 'rotate-180' : ''}`} aria-hidden />
          </Button>
        </div>

        <div id={whyId} hidden={!showWhy} className="mt-4 rounded-2xl bg-canvas p-3">
          <h3 className="mb-2 text-sm font-semibold">Recommended because</h3>
          <ReasonList reasons={reasons} />
          <p className="mt-3 text-xs text-subtle">{method}</p>
        </div>
      </div>
    </section>
  );
}
