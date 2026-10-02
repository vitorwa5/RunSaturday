import { Plus, Timer } from 'lucide-react';
import { PerformanceList } from '../components/profile/PerformanceList';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { usePerformances } from '../hooks/queries';

/** All of the user's performances, newest first. */
export function PerformancesPage() {
  const { data, isPending, isError, error, refetch } = usePerformances();
  return (
    <div className="space-y-4">
      <PageHeader
        back
        title="Your performances"
        subtitle={data ? `${data.total} recorded` : undefined}
        actions={
          <ButtonLink to="/profile/performances/new" variant="secondary" className="min-h-10 px-3" aria-label="Add performance">
            <Plus className="size-4" aria-hidden />
            Add
          </ButtonLink>
        }
      />
      {isPending ? (
        <LoadingState variant="card" label="Loading performances" />
      ) : isError ? (
        <ErrorState error={error} title="Performances could not be loaded" onRetry={() => refetch()} />
      ) : data.performances.length === 0 ? (
        <EmptyState icon={Timer} title="No performances yet" description="Add a 5K you have run." action={<ButtonLink to="/profile/performances/new">Add performance</ButtonLink>} />
      ) : (
        <PerformanceList performances={data.performances} label="All performances" />
      )}
    </div>
  );
}
