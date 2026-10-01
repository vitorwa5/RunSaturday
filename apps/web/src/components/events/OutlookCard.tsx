import { formatFinishTime, type UserProfile } from '@runsaturday/shared';
import { Clock3, Target } from 'lucide-react';
import { Link } from 'react-router';
import { DemoBadge } from '../ui/DemoBadge';

const PENDING = ['Expected 5K here', 'Historical placement', 'Top-10 frequency'];

/**
 * "Your outlook". Only the runner's current form is shown as a number; personal forecasts
 * stay unavailable until the placement and course-adjustment engines exist, rather than
 * showing invented values.
 */
export function OutlookCard({ profile }: { profile: UserProfile | undefined }) {
  const form = profile?.current5kEstimateSeconds;
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
        {PENDING.map((label) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2">
            <dt className="font-medium">{label}</dt>
            <dd className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-subtle">
              <Clock3 className="size-3.5" aria-hidden />
              Not available yet
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-1 text-xs text-subtle">
        These will show how your time has historically placed here, never a prediction of who turns up.{' '}
        <Link to="/where-could-i-place" className="font-semibold text-brand-700 underline">
          Learn more
        </Link>
      </p>
    </section>
  );
}
