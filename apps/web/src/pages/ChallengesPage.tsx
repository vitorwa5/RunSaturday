import { Flag } from 'lucide-react';
import { ChallengeProgressCard } from '../components/explore/ChallengeProgressCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useChallenges } from '../hooks/queries';

/** My Challenges: one card per challenge in the server's catalogue (no placeholders). */
export function ChallengesPage() {
  const { data, isPending, isError, error, refetch } = useChallenges();
  return (
    <div className="space-y-4">
      <PageHeader back title="My Challenges" subtitle="5K Compass challenges, worked out from the runs you have recorded." />
      {isPending ? (
        <LoadingState variant="card" label="Loading challenges" />
      ) : isError ? (
        <ErrorState error={error} title="Challenges could not be loaded" onRetry={() => refetch()} />
      ) : data.challenges.length === 0 ? (
        <EmptyState icon={Flag} title="No challenges yet" description="Challenges will appear here." />
      ) : (
        <ul className="space-y-3" aria-label="Challenges">
          {data.challenges.map((c) => (
            <li key={c.id}>
              <ChallengeProgressCard challenge={c} description={c.description} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">
        Progress comes only from runs you have recorded at events 5K Compass knows about. These are 5K Compass challenges, not official parkrun challenges.
      </p>
    </div>
  );
}
