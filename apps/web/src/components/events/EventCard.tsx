import type { EventSummary } from '@runsaturday/shared';
import { ChevronRight, Heart } from 'lucide-react';
import { Link } from 'react-router';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { pbLabel } from '../../lib/display';
import { DemoBadge } from '../ui/DemoBadge';
import { ScoreBadge } from '../ui/ScoreBadge';
import { TravelBadge } from '../ui/TravelBadge';

/**
 * Compact, tappable event row (Home options, Explore, search results). Shows only what is
 * needed to decide whether to open the event.
 */
export function EventCard({ event }: { event: EventSummary }) {
  return (
    <Link
      to={`/event/${event.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate font-semibold">{event.name}</h3>
          {event.favourite && <Heart className="size-3.5 shrink-0 fill-brand-600 text-brand-600" aria-label="Saved" />}
          {event.source === 'demo' && <DemoBadge />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {event.town && <span>{event.town}</span>}
          <TravelBadge travel={event.travel} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ScoreBadge label={pbLabel(true)} score={event.scores?.pbScore} />
          <ScoreBadge label="Comp" score={event.scores?.competitionScore} kind="competition" />
          <ConfidenceBadge level={event.scores?.pbConfidence ?? 'insufficient'} compact />
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />
    </Link>
  );
}
