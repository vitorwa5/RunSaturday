import type { Recommendation } from '@runsaturday/shared';
import { Car } from 'lucide-react';
import { useId, useState } from 'react';
import { formatCount, formatDifficulty, formatScore } from '../../lib/display';
import { ButtonLink } from '../ui/Button';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { DemoBadge } from '../ui/DemoBadge';
import { RankedMetric } from './RankedMetric';
import { WhyThisButton, WhyThisPanel } from './WhyThis';

/** Ranked Saturday Planner result: the ranking metric leads, other metrics are secondary. */
export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const { rank, event, rankedBy, highlights, reasons } = recommendation;
  const [showWhy, setShowWhy] = useState(false);
  const whyId = useId();
  const s = event.scores;

  const secondary = [
    { key: 'pb_score', label: 'PB Score', value: `${formatScore(s?.pbScore)}/100` },
    { key: 'difficulty', label: 'Difficulty', value: `${formatDifficulty(s?.difficultyScore)}/10` },
    { key: 'competition_score', label: 'Competition', value: `${formatScore(s?.competitionScore)}/100` },
    { key: 'average_participants', label: 'Avg runners', value: formatCount(event.averageParticipants) },
  ].filter((m) => m.key !== rankedBy.key);

  return (
    <article aria-label={`Rank ${rank}: ${event.name}`} className="rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_4px_rgba(24,24,27,0.05)]">
      <header className="flex items-start gap-3">
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold tabular-nums ${
            rank === 1 ? 'bg-brand-700 text-white' : 'bg-zinc-100 text-ink'
          }`}
          aria-hidden
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg leading-tight font-bold">{event.name}</h3>
            {event.source === 'demo' && <DemoBadge />}
          </div>
          <p className="mt-0.5 text-sm text-muted">{[event.town, ...highlights].filter(Boolean).join(' · ')}</p>
        </div>
      </header>

      <div className="mt-3 flex items-end justify-between gap-3">
        <RankedMetric rankedBy={rankedBy} size="md" />
        {rankedBy.key !== 'travel_minutes' && (
          <p className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-sm font-semibold text-muted tabular-nums" title="Estimated from straight-line distance">
            <Car className="size-4" aria-hidden />
            {event.travel ? `~${event.travel.minutes} min` : '—'}
            <span className="sr-only">estimated travel</span>
          </p>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs">
        {secondary.map((m) => (
          <div key={m.key} className="flex gap-1">
            <dt className="text-muted">{m.label}</dt>
            <dd className="font-bold tabular-nums">{m.value}</dd>
          </div>
        ))}
        <div>
          <dt className="sr-only">Data confidence</dt>
          <dd>
            <ConfidenceBadge level={s?.pbConfidence ?? 'insufficient'} sampleSize={s?.sampleSize} compact />
          </dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ButtonLink to={`/event/${event.id}`} variant="secondary" className="min-h-10">
          View event
        </ButtonLink>
        <WhyThisButton open={showWhy} controls={whyId} onToggle={() => setShowWhy((v) => !v)} className="min-h-10" />
      </div>
      <WhyThisPanel id={whyId} open={showWhy} reasons={reasons} />
    </article>
  );
}
