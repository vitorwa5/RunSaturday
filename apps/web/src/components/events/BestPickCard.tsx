import type { Recommendation } from '@runsaturday/shared';
import { Car, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { formatScore } from '../../lib/display';
import { AlertBanner } from '../ui/AlertBanner';
import { ButtonLink } from '../ui/Button';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { DemoBadge } from '../ui/DemoBadge';
import { RankedMetric } from './RankedMetric';
import { WhyThisButton, WhyThisPanel } from './WhyThis';

interface BestPickCardProps {
  recommendation: Recommendation;
  /** How the pick was ranked, e.g. "ranked using PB Score". */
  method: string;
}

/** The single most prominent recommendation on Home. Each fact appears once. */
export function BestPickCard({ recommendation, method }: BestPickCardProps) {
  const { event, rankedBy, highlights, reasons } = recommendation;
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();
  const s = event.scores;
  const limited = !s || s.pbConfidence === 'insufficient';
  const isDemo = event.source === 'demo';

  return (
    <section aria-label="Your best pick" className="rounded-3xl border border-line bg-surface p-5 shadow-[0_2px_12px_rgba(24,24,27,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-brand-700 uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          Your best pick
        </p>
        {isDemo && <DemoBadge />}
      </div>

      <h2 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight">{event.name}</h2>
      {event.town && <p className="mt-0.5 text-sm text-muted">{event.town}</p>}
      {highlights.length > 0 && <p className="mt-2 text-sm font-semibold text-ink">{highlights.join(' · ')}</p>}

      <div className="mt-4">
        <RankedMetric rankedBy={rankedBy} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        {rankedBy.key === 'travel_minutes' ? (
          <div>
            <dt className="text-xs font-semibold text-muted">PB Score</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums">{formatScore(s?.pbScore)} / 100</dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs font-semibold text-muted">Estimated travel</dt>
            <dd className="mt-0.5 flex items-center gap-1 text-lg font-bold tabular-nums">
              <Car className="size-4 text-subtle" aria-hidden />
              {event.travel ? `~${event.travel.minutes} min` : 'Unknown'}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-semibold text-muted">Confidence</dt>
          <dd className="mt-1">
            <ConfidenceBadge level={s?.pbConfidence ?? 'insufficient'} sampleSize={s?.sampleSize} compact />
          </dd>
        </div>
      </dl>

      {limited && (
        <div className="mt-4">
          <AlertBanner tone="caution" title="Limited data">
            Only a few recent events are available, so treat this pick as a rough guide.
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
