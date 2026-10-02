import { Flag } from 'lucide-react';
import { Link } from 'react-router';
import { useExploreSummary } from '../../hooks/queries';
import { ChallengeProgressCard } from '../explore/ChallengeProgressCard';
import { Skeleton } from '../ui/LoadingState';
import { SectionHeading } from '../ui/PageHeader';

/** The exploration side of the runner's history (Phase 5A), next to, not instead of, performance. */
export function My5kSummary() {
  const { data: s, isPending } = useExploreSummary();
  return (
    <section aria-labelledby="my-5k" className="space-y-2">
      <SectionHeading
        action={
          <Link to="/challenges" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700">
            <Flag className="size-4" aria-hidden />
            My Challenges
          </Link>
        }
      >
        <span id="my-5k">My 5K</span>
      </SectionHeading>
      {isPending || !s ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Events visited</dt>
              <dd className="text-lg font-bold tabular-nums">
                {s.eventsVisited} <span className="text-xs font-normal text-muted">of {s.eventsInDataset}</span>
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Total recorded runs</dt>
              <dd className="text-lg font-bold tabular-nums">{s.totalRuns}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Most visited</dt>
              <dd className="truncate font-semibold">{s.mostVisited ? `${s.mostVisited.eventName} — ${s.mostVisited.visitCount}` : '—'}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-3 py-2">
              <dt className="text-xs text-muted">Challenges completed</dt>
              <dd className="text-lg font-bold tabular-nums">{s.challengesCompleted}</dd>
            </div>
          </dl>
          {s.challenges.map((c) => (
            <ChallengeProgressCard key={c.id} challenge={c} compact />
          ))}
          <p className="text-xs text-muted">
            An event counts as visited once you have recorded a run there. Runs at races 5K Compass does not model count as runs, not as visits.
          </p>
        </>
      )}
    </section>
  );
}
