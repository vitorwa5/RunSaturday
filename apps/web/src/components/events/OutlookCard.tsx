import { formatFinishTime, type UserProfile } from '@runsaturday/shared';
import { Clock3, Columns3, Medal, Target, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useEventPlacement } from '../../hooks/queries';
import { formatFrequency, formatPlacementRange } from '../../lib/display';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { DemoBadge } from '../ui/DemoBadge';
import { Skeleton } from '../ui/LoadingState';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="font-medium">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const NotYet = () => (
  <span className="inline-flex items-center gap-1 text-xs font-semibold text-subtle">
    <Clock3 className="size-3.5" aria-hidden />
    Not available yet
  </span>
);

/**
 * "Your outlook": how the runner's current form would historically have placed here (real
 * placement engine, last 90 days). Expected time stays unavailable until a course-adjustment
 * model exists.
 */
export function OutlookCard({ profile, eventId }: { profile: UserProfile | undefined; eventId: string }) {
  const form = profile?.current5kEstimateSeconds;
  const { data: placement, isPending, isError } = useEventPlacement(eventId, form);
  const stats = placement?.stats;
  const enough = placement != null && placement.confidence !== 'insufficient';

  let placementRows: ReactNode;
  if (form == null) {
    placementRows = (
      <Row label="Historical placement">
        <span className="text-xs text-subtle">Set your current form</span>
      </Row>
    );
  } else if (isPending) {
    placementRows = (
      <div className="space-y-2 py-2" role="status">
        <span className="sr-only">Loading placement…</span>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (isError || !stats) {
    placementRows = (
      <Row label="Historical placement">
        <span className="text-xs text-subtle">Not enough results</span>
      </Row>
    );
  } else {
    placementRows = (
      <>
        <Row label="Typical historical position">
          <span className="font-bold tabular-nums">{formatPlacementRange(stats.typicalRange)}</span>
          <span className="block text-xs text-subtle">median {formatPlacementRange(stats.medianPlacement)}</span>
        </Row>
        <Row label="Top 10 historically">
          <span className="font-bold tabular-nums">{formatFrequency(stats.frequencies.top10)}</span>
        </Row>
      </>
    );
  }

  return (
    <section aria-labelledby="outlook-heading" className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="outlook-heading" className="flex items-center gap-2 text-base font-bold">
          <Target className="size-5 text-brand-700" aria-hidden />
          Your outlook
        </h2>
        {profile?.isDemo && <DemoBadge />}
      </div>

      <dl className="mt-3 divide-y divide-line text-sm">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <dt className="text-muted">Your current 5K form</dt>
          <dd className="text-lg font-bold tabular-nums">{form != null ? formatFinishTime(form) : 'Not set'}</dd>
        </div>
        {placementRows}
        <Row label="Expected 5K here">
          <NotYet />
        </Row>
      </dl>

      {placement && stats && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ConfidenceBadge level={placement.confidence} sampleSize={placement.sampleSize} compact />
          <span className="text-xs text-subtle">last 90 days</span>
        </div>
      )}
      <p className="mt-2 text-xs text-subtle">
        {enough && form != null
          ? `Historically, ${formatFinishTime(form)} would have placed like this here. Past fields only, not a prediction of who turns up.`
          : 'Based on past results only, never a prediction of who turns up.'}
      </p>

      <nav aria-label="Related tools" className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {[
          { to: `/where-could-i-place?src=current`, label: 'Where else could I place?', icon: Medal },
          { to: '/pb-finder', label: 'PB Finder', icon: Timer },
          { to: `/compare?ids=${eventId}`, label: 'Compare', icon: Columns3 },
        ].map(({ to, label, icon: Icon }) => (
          <Link key={label} to={to} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold hover:bg-zinc-50">
            <Icon className="size-3.5 text-brand-700" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
