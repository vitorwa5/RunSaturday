import type { EventSummary } from '@runsaturday/shared';
import { ChevronRight, Heart } from 'lucide-react';
import { Link } from 'react-router';
import { formatCount } from '../../lib/display';
import { DemoBadge } from '../ui/DemoBadge';
import { ScoreBadge } from '../ui/ScoreBadge';
import { TravelBadge } from '../ui/TravelBadge';

/** Compact, tappable event row used in lists (Near you, Explore, search results). */
export function EventCard({ event }: { event: EventSummary }) {
  const limited = event.scores?.pbConfidence === 'insufficient';
  return (
    <Link
      to={`/event/${event.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
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
          {event.averageParticipants != null && <span>{formatCount(event.averageParticipants)} runners avg</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ScoreBadge label="PB" score={event.scores?.pbScore} />
          <ScoreBadge label="Comp" score={event.scores?.competitionScore} kind="competition" />
          {limited && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-muted">Limited data</span>}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />
    </Link>
  );
}
