import type { Recommendation } from '@runsaturday/shared';
import { Car, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { AlertBanner } from '../ui/AlertBanner';
import { ButtonLink } from '../ui/Button';
import { DemoBadge } from '../ui/DemoBadge';
import { RankedMetric } from './RankedMetric';
import { DataConfidencePill, WhyThisOne } from './WhyThisOne';
import { WhyThisButton, WhyThisPanel } from './WhyThis';

interface BestPickCardProps {
  recommendation: Recommendation;
  /** How this intent ranks, e.g. "ranked using PB Score". */
  method: string;
}

/**
 * The best match for the selected intent and constraints: not "the best event". Leads with the
 * reasons; the ranking metric and full explanation stay one tap away.
 */
export function BestPickCard({ recommendation, method }: BestPickCardProps) {
  const { event, rankedBy, highlights, reasons, why, dataConfidence } = recommendation;
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();
  const isDemo = event.source === 'demo';
  const showMetric = rankedBy.key !== 'travel_minutes' && rankedBy.key !== 'interest_signals';

  return (
    <section aria-label="Best match for your goal" className="rounded-3xl border border-line bg-surface p-5 shadow-[0_2px_12px_rgba(24,24,27,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-brand-700 uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          Best match for your goal
        </p>
        {isDemo && <DemoBadge />}
      </div>

      <h2 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight">{event.name}</h2>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
        {event.town && <span>{event.town}</span>}
        {event.travel && (
          <span className="inline-flex items-center gap-1">
            <Car className="size-4" aria-hidden />~{event.travel.minutes} min<span className="sr-only"> estimated travel</span>
          </span>
        )}
        {highlights.length > 0 && <span className="font-semibold text-ink">{highlights.join(' · ')}</span>}
      </p>

      {why && why.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Why this one</h3>
          <WhyThisOne why={why} />
        </div>
      )}

      {(showMetric || dataConfidence) && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
          {showMetric && <RankedMetric rankedBy={rankedBy} size="md" />}
          {dataConfidence && <DataConfidencePill note={dataConfidence} />}
        </div>
      )}

      {dataConfidence?.level === 'insufficient' && (
        <div className="mt-4">
          <AlertBanner tone="caution" title="Limited data">
            The evidence behind this match is thin, so treat it as a rough guide.
          </AlertBanner>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <ButtonLink to={`/event/${event.id}`}>View event</ButtonLink>
        <WhyThisButton open={showWhy} controls={whyId} onToggle={() => setShowWhy((v) => !v)} />
      </div>
      <WhyThisPanel id={whyId} open={showWhy} reasons={reasons} />

      <p className="mt-4 text-xs text-subtle">
        {isDemo ? 'Demo recommendation' : 'Recommendation'} · {method}
      </p>
    </section>
  );
}
