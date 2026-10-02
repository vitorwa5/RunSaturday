import { formatDateWithYear, type ChallengeItem, type ChallengeResult } from '@runsaturday/shared';
import { Check, Flag } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ProgressBar } from '../components/explore/ChallengeProgressCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { useChallenge } from '../hooks/queries';
import { ApiError } from '../api/client';
import { CHALLENGE_STATUS_LABEL, challengeFilterLink, letterArticle } from '../lib/display';

function ItemTile({ challenge, item }: { challenge: ChallengeResult; item: ChallengeItem }) {
  if (item.completed) {
    const by = item.completedBy!;
    return (
      <li className="relative flex min-w-0 flex-col rounded-xl border border-brand-700 bg-brand-50 p-2 text-brand-800" aria-label={`${item.label}: completed at ${by.eventName} on ${formatDateWithYear(by.date)}`}>
        <span className="text-xl leading-none font-extrabold">{item.label}</span>
        <Check className="absolute top-2 right-2 size-4" strokeWidth={3} aria-hidden />
        <span className="mt-1 truncate text-[11px] font-semibold" title={by.eventName}>
          {by.eventName}
        </span>
        <span className="text-[11px] tabular-nums">{formatDateWithYear(by.date)}</span>
        {item.qualifyingEvents.length > 1 && <span className="text-[10px] text-brand-700">+{item.qualifyingEvents.length - 1} more</span>}
      </li>
    );
  }
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-dashed border-line bg-surface p-2" aria-label={`${item.label}: not completed`}>
      <span className="text-xl leading-none font-extrabold text-subtle">{item.label}</span>
      <span className="mt-1 text-[11px] leading-tight text-muted">Not completed</span>
      {item.opportunities.length > 0 && (
        <Link to={challengeFilterLink(challenge.id, item.key)} className="mt-auto inline-flex min-h-8 items-end pt-1 text-[11px] font-semibold whitespace-nowrap text-brand-700">
          Find {letterArticle(item.label)} {item.label}
        </Link>
      )}
    </li>
  );
}

export function ChallengeDetailPage() {
  const { id = '' } = useParams();
  const { data: c, isPending, isError, error, refetch } = useChallenge(id);

  if (isPending) return <LoadingState variant="card" label="Loading challenge" />;
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader back title="Challenge" />
        {error instanceof ApiError && error.status === 404 ? (
          <EmptyState icon={Flag} title="Challenge not found" description="It may have been renamed or removed." />
        ) : (
          <ErrorState error={error} title="Challenge could not be loaded" onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  const { current, target, percentage } = c.progress;
  const missing = c.items.filter((i) => !i.completed);
  const findable = missing.filter((i) => i.opportunities.length > 0);
  const notInDataset = missing.length - findable.length;

  return (
    <div className="space-y-5">
      <PageHeader back title={c.name} />

      <section aria-label="Progress" className="rounded-3xl border border-line bg-surface p-4">
        <p className="text-2xl font-extrabold tabular-nums">
          {current} of {target} completed
        </p>
        <div className="mt-1 flex justify-between text-sm text-muted">
          <span>{CHALLENGE_STATUS_LABEL[c.status]}</span>
          <span className="tabular-nums">{percentage}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar label={`${c.name} progress`} percentage={percentage} />
        </div>
        {c.completedOn && <p className="mt-2 text-sm font-semibold">Completed on {formatDateWithYear(c.completedOn)}</p>}
        <p className="mt-2 text-xs text-muted">{c.description}</p>
      </section>

      <section aria-labelledby="challenge-items">
        <SectionHeading>
          <span id="challenge-items">{c.kind === 'initial_letters' ? 'Letters' : 'Items'}</span>
        </SectionHeading>
        <ul aria-label={`${c.name} ${c.kind === 'initial_letters' ? 'letters' : 'items'}`} className="grid grid-cols-3 gap-2 min-[380px]:grid-cols-4 sm:grid-cols-5">
          {c.items.map((item) => (
            <ItemTile key={item.key} challenge={c} item={item} />
          ))}
        </ul>
      </section>

      {missing.length > 0 && (
        <section aria-labelledby="challenge-opportunities" className="space-y-2">
          <SectionHeading>
            <span id="challenge-opportunities">Events that would add one</span>
          </SectionHeading>
          {findable.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm" aria-label="Possible events in the current dataset">
              {findable.map((i) => (
                <li key={i.key} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-5 shrink-0 text-base font-extrabold">{i.label}</span>
                  <span className="min-w-0 flex-1">
                    {i.opportunities.map((o, n) => (
                      <span key={o.eventId}>
                        <Link to={`/event/${o.eventId}`} className="font-semibold text-brand-700">
                          {o.eventName}
                        </Link>
                        {o.town && <span className="text-xs text-muted"> · {o.town}</span>}
                        {n < i.opportunities.length - 1 && <br />}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No event in the current 5K Compass dataset would add a missing item.</p>
          )}
          <p className="text-xs text-subtle">
            From the events 5K Compass currently knows about, listed by name; not ranked by distance or date.
            {notInDataset > 0 && ` ${notInDataset} missing ${notInDataset === 1 ? 'item has' : 'items have'} no matching event in the current dataset.`}
          </p>
        </section>
      )}

      <section aria-labelledby="challenge-rules" className="space-y-2 text-sm text-muted">
        <SectionHeading>
          <span id="challenge-rules">Rules</span>
        </SectionHeading>
        <ul className="list-disc space-y-1 pl-5">
          {c.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
