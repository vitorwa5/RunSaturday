import { COURSE_NOT_MODELLED_MESSAGE, formatFinishTime, type UserPerformance, type UserProfile } from '@runsaturday/shared';
import { Columns3, Medal, Target, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useEventPlacement } from '../../hooks/queries';
import { formatDeltaSeconds, formatFrequency, formatPlacementRange, RAW_FALLBACK_LABEL } from '../../lib/display';
import { currentFormSeconds } from '../../lib/runnerTime';
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

/**
 * What the outlook is based on: Current Form (course-neutral, converted on the server) when there
 * is an estimate; otherwise the recent best, then the Overall 5K PB, each from where it was run.
 */
interface OutlookBasis {
  kind: 'form' | 'performance';
  seconds: number;
  label: string;
  /** Known (modelled) event where it was run: enables course adjustment. */
  source?: { id: string; name: string };
  /** Set when it was run at a course 5K Compass does not model: raw time only. */
  externalCourse?: string;
}

function outlookBasis(profile: UserProfile | undefined): OutlookBasis | null {
  const from = (p: UserPerformance | null | undefined, label: string): OutlookBasis | null =>
    p
      ? {
          kind: 'performance',
          seconds: p.finishTimeSeconds,
          label,
          ...(p.eventId != null ? { source: { id: p.eventId, name: p.eventName } } : { externalCourse: p.eventName }),
        }
      : null;
  const form = currentFormSeconds(profile);
  if (form != null) return { kind: 'form', seconds: form, label: 'Current Form' };
  return from(profile?.performance.recentBest, 'recent best') ?? from(profile?.performance.lifetimePb, 'overall 5K PB');
}

/**
 * "Your outlook": the runner's performance converted to an equivalent here with Course Speed
 * Factor V1, and how that equivalent would historically have placed (last 90 days). Never a
 * predicted finish time.
 */
export function OutlookCard({ profile, eventId }: { profile: UserProfile | undefined; eventId: string }) {
  const form = currentFormSeconds(profile);
  const basis = outlookBasis(profile);
  const { data: placement, isPending, isError } = useEventPlacement(
    eventId,
    basis == null ? null : basis.kind === 'form' ? { basis: 'current_form' } : { timeSeconds: basis.seconds, source: basis.source?.id },
  );
  const stats = placement?.stats;
  const enough = placement != null && placement.confidence !== 'insufficient';
  const adjustment = placement?.adjustment ?? null;
  const adjusted = adjustment?.available === true && adjustment.equivalentSeconds != null;

  let placementRows: ReactNode;
  if (basis == null) {
    placementRows = (
      <Row label="Historical placement">
        <span className="text-xs text-subtle">Add a performance</span>
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
          <dt className="text-muted">Current Form</dt>
          <dd className="text-right">
            {form != null ? (
              <span className="text-lg font-bold tabular-nums">≈ {formatFinishTime(form)}</span>
            ) : (
              <span className="text-xs font-semibold text-subtle">Unavailable</span>
            )}
          </dd>
        </div>
        <Row label="Equivalent 5K here">
          {basis == null ? (
            <span className="text-xs text-subtle">Add a performance</span>
          ) : isPending ? (
            <Skeleton className="ml-auto h-4 w-16" />
          ) : adjusted ? (
            <>
              <span className="text-lg font-extrabold tabular-nums">≈ {formatFinishTime(adjustment.equivalentSeconds!)}</span>
              <span className="block text-xs text-subtle">
                {adjustment.sourceKind === 'current_form'
                  ? 'From your course-neutral Current Form'
                  : adjustment.sourceEventId === eventId
                  ? `Your ${basis.label} here`
                  : `Adjusted from ${formatFinishTime(adjustment.sourceSeconds)} at ${adjustment.sourceEventName} (${formatDeltaSeconds(adjustment.deltaSeconds ?? 0)})`}
              </span>
            </>
          ) : adjustment ? (
            <span className="block max-w-48 text-xs font-semibold text-subtle">{adjustment.reason}</span>
          ) : (
            <span className="block max-w-48 text-xs text-subtle">
              {basis.externalCourse != null
                ? `${COURSE_NOT_MODELLED_MESSAGE} (${basis.externalCourse})`
                : 'Course adjustment requires a source event.'}
            </span>
          )}
        </Row>
        {basis != null && !isPending && !adjusted && (
          <p className="py-2 text-xs font-bold text-caution" role="note">
            {RAW_FALLBACK_LABEL}
          </p>
        )}
        {placementRows}
      </dl>

      {placement && stats && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ConfidenceBadge level={placement.confidence} sampleSize={placement.sampleSize} compact />
          <span className="text-xs text-subtle">last 90 days</span>
          {adjusted && (adjustment.sourceKind === 'current_form' || adjustment.sourceEventId !== eventId) && (
            <span className="text-xs text-subtle">
              · adjustment confidence <ConfidenceBadge level={adjustment.confidence} compact />
            </span>
          )}
        </div>
      )}
      {basis?.kind === 'form' && adjusted && <p className="mt-2 text-xs text-muted">Equivalent here is based on your current course-normalised form.</p>}
      {basis != null && basis.kind !== 'form' && profile && (
        <p className="mt-2 text-xs text-muted">Current Form unavailable: {profile.currentForm.limitedReason ?? 'not enough recent performances.'} Using your {basis.label}.</p>
      )}
      <p className="mt-2 text-xs text-subtle">
        {enough && placement
          ? `Historically, ${adjusted ? '≈ ' : ''}${formatFinishTime(placement.analysedSeconds)} would have placed like this here. ${
              adjusted
                ? 'An equivalent performance from past results, not a predicted finish time.'
                : 'Raw time, not course-adjusted. Past fields only, not a prediction of who turns up.'
            }`
          : 'Based on past results only, never a prediction of who turns up.'}
      </p>

      <nav aria-label="Related tools" className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {[
          {
            to: basis?.label === 'recent best' ? '/where-could-i-place?src=recent' : basis?.label === 'overall 5K PB' ? '/where-could-i-place?src=pb' : '/where-could-i-place?src=current',
            label: 'Where else could I place?',
            icon: Medal,
          },
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
