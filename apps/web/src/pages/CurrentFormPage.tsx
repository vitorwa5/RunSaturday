import { formatDateWithYear, formatFinishTime, type RunnerForm } from '@runsaturday/shared';
import { Medal } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { ConfidenceBadge } from '../components/ui/ConfidenceBadge';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { useCurrentForm } from '../hooks/queries';
import { formatAgo, TREND_LABEL } from '../lib/display';

const pct = (w: number) => `${Math.round(w * 100)}%`;

function Summary({ form }: { form: RunnerForm }) {
  const lastAge = form.lastPerformanceDate ? formatAgo(form.lastPerformanceDate, form.asOfDate) : null;
  return (
    <section aria-label="Current Form summary" className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Current Form</p>
      {form.status === 'estimate' ? (
        <p className="mt-1 text-4xl font-extrabold tabular-nums">≈ {formatFinishTime(form.formSeconds!)}</p>
      ) : (
        <p className="mt-1 text-lg font-bold text-muted">Unavailable</p>
      )}
      {form.status === 'indicative' && form.indicativeSeconds != null && (
        <p className="text-sm text-muted">≈ {formatFinishTime(form.indicativeSeconds)} from your one eligible run, for reference only.</p>
      )}
      {form.limitedReason && <p className="mt-1 text-sm text-muted">{form.limitedReason}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Based on</dt>
          <dd className="font-semibold">
            {form.sampleSize} recent {form.sampleSize === 1 ? 'performance' : 'performances'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Events</dt>
          <dd className="font-semibold">
            {form.eventCount} different {form.eventCount === 1 ? 'event' : 'events'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Last performance</dt>
          <dd className="font-semibold">{lastAge ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Trend</dt>
          <dd className="font-semibold">
            {TREND_LABEL[form.trend.direction]}
            {form.trend.changePercentPer90Days != null && (form.trend.direction === 'improving' || form.trend.direction === 'declining') && (
              <span className="block text-xs font-normal text-subtle">
                {form.trend.changePercentPer90Days > 0 ? '+' : ''}
                {form.trend.changePercentPer90Days}% per 90 days
              </span>
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-muted">Confidence</span>
        <ConfidenceBadge level={form.confidence.level} />
      </div>
      {form.status === 'estimate' && (
        <ButtonLink to="/where-could-i-place?src=current" variant="secondary" className="mt-3 min-h-10 w-full">
          <Medal className="size-4" aria-hidden />
          Where could I place with this?
        </ButtonLink>
      )}
    </section>
  );
}

/** "How is my Current Form calculated?": the full, transparent runner_form_v1 breakdown. */
export function CurrentFormPage() {
  const { data: form, isPending, isError, error, refetch } = useCurrentForm();
  return (
    <div className="space-y-6">
      <PageHeader back title="How is my Current Form calculated?" />
      {isPending ? (
        <LoadingState variant="card" label="Loading Current Form" />
      ) : isError ? (
        <ErrorState error={error} title="Current Form could not be loaded" onRetry={() => refetch()} />
      ) : (
        <>
          <Summary form={form} />

          <section aria-labelledby="form-method" className="space-y-2 text-sm text-muted">
            <SectionHeading>
              <span id="form-method">Method</span>
            </SectionHeading>
            <p>
              Current Form is a modelled estimate of your present 5K ability, not a recorded result and not a prediction of a finish time. It uses your 5K runs
              from the last {form.method.horizonDays} days at courses 5K Compass models.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Each run is course-normalised: your time ÷ the course’s Speed Factor, so a hilly course and a fast one are compared fairly.</li>
              <li>Recent runs count more: a run {form.method.halfLifeDays} days old counts half as much as one today.</li>
              <li>An unusually slow run (an easy day, pacing, illness) keeps a reduced influence; a genuine fast run counts in full.</li>
              <li>Your PBs are achievements, not current ability: an old PB does not pull Current Form towards it.</li>
            </ul>
            <p className="text-xs text-subtle">
              Version {form.version}. The time is course-neutral: 1.000 is the reference of the analysed course cohort, not a particular course.
            </p>
          </section>

          {form.inputs.length > 0 && (
            <section aria-labelledby="form-inputs">
              <SectionHeading>
                <span id="form-inputs">Recent runs used</span>
              </SectionHeading>
              <ul aria-label="Recent runs used" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
                {form.inputs.map((i) => (
                  <li key={i.performanceId} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{i.eventName}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatFinishTime(i.neutralSeconds)} equivalent</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted">
                      <span>
                        {formatDateWithYear(i.date)} · ran {formatFinishTime(i.actualSeconds)} · course {i.courseFactor.toFixed(3)}
                      </span>
                      <span>
                        weight {pct(i.share)}
                        {i.robustWeight < 1 && ' · reduced influence'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="form-confidence" className="rounded-2xl border border-line bg-surface p-3 text-xs">
            <h2 id="form-confidence" className="text-sm font-semibold">
              Confidence {form.confidence.score > 0 && <span className="font-normal text-subtle">· {form.confidence.score}/100</span>}
            </h2>
            <ul className="mt-2 space-y-2">
              {form.confidence.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex justify-between gap-3">
                    <span className="font-medium text-ink">
                      {f.label} <span className="font-normal text-subtle">· {pct(f.weight)}</span>
                    </span>
                    <strong className="tabular-nums">{f.value}</strong>
                  </div>
                  <p className="text-subtle">{f.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-subtle">Confidence describes the evidence behind the estimate, not the chance of running this time.</p>
          </section>

          {form.excluded.length > 0 && (
            <section aria-labelledby="form-excluded">
              <SectionHeading>
                <span id="form-excluded">Not included</span>
              </SectionHeading>
              <ul aria-label="Performances not included" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
                {form.excluded.slice(0, 10).map((e) => (
                  <li key={e.performanceId} className="px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{e.eventName}</span>
                      <span className="shrink-0 tabular-nums">{formatFinishTime(e.finishTimeSeconds)}</span>
                    </div>
                    <p className="text-xs text-muted">
                      {formatDateWithYear(e.date)} · {e.explanation}
                    </p>
                  </li>
                ))}
              </ul>
              {form.excluded.length > 10 && <p className="mt-1 text-xs text-subtle">and {form.excluded.length - 10} older performances.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
