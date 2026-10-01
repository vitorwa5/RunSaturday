import {
  DEFAULT_HISTORY_WINDOW,
  formatFinishTime,
  HISTORY_WINDOWS,
  type CompetitionBreakdown,
  type ConfidenceAssessment,
  type DifficultyBreakdown,
  type HistoryWindowId,
} from '@runsaturday/shared';
import { Calculator, ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useEventAnalytics } from '../../hooks/queries';
import { ChoiceChips } from '../ui/ChoiceChips';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { ErrorState } from '../ui/ErrorState';
import { Skeleton } from '../ui/LoadingState';

const pct = (w: number) => `${Math.round(w * 100)}%`;

function Bar({ value }: { value: number | null }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
      {value != null && <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, value)}%` }} />}
    </div>
  );
}

function ComponentRow({ label, weight, value, detail, missingText }: { label: string; weight: number; value: number | null; detail: ReactNode; missingText: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {label} <span className="font-normal text-subtle">· {pct(weight)}</span>
        </span>
        <span className="tabular-nums">{value == null ? <span className="text-xs font-semibold text-subtle">{missingText}</span> : <strong>{value}</strong>}</span>
      </div>
      <Bar value={value} />
      <p className="mt-0.5 text-xs text-subtle">{detail}</p>
    </li>
  );
}

function ConfidenceDetail({ confidence }: { confidence: ConfidenceAssessment }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">Data confidence</span>
        <ConfidenceBadge level={confidence.level} compact />
      </div>
      <ul className="mt-2 space-y-2 text-xs">
        {confidence.factors.map((f) => (
          <li key={f.key}>
            <div className="flex justify-between gap-3">
              <span className="font-medium text-ink">
                {f.label}
                {confidence.factors.length > 1 && <span className="font-normal text-subtle"> · {pct(f.weight)}</span>}
              </span>
              <strong className="tabular-nums">{f.value}</strong>
            </div>
            <p className="text-subtle">{f.detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-subtle">Confidence score {confidence.score}/100 describes the data behind this score, not the chance of any result.</p>
    </div>
  );
}

function CompetitionPanel({ b }: { b: CompetitionBreakdown }) {
  return (
    <div>
      <p className="text-sm">
        <strong className="text-lg tabular-nums">{b.value == null ? 'Limited data' : `${b.value}/100`}</strong>
        <span className="ml-2 text-xs text-subtle">{b.version}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Based on {b.sampleSize} usable {b.sampleSize === 1 ? 'event' : 'events'}, compared with {b.cohortSize} analysed events
        {b.excluded.cancelled + b.excluded.insufficientData > 0 && ` (${b.excluded.cancelled} cancelled, ${b.excluded.insufficientData} incomplete excluded)`}.
      </p>
      <ul className="mt-3 space-y-2.5">
        {b.components.map((c) => (
          <ComponentRow
            key={c.key}
            label={c.label}
            weight={c.weight}
            value={c.value}
            missingText="Not enough data"
            detail={c.medianSeconds != null ? `Median ${formatFinishTime(c.medianSeconds)} over ${c.observations} events` : `Only ${c.observations} events reached this position`}
          />
        ))}
      </ul>
      <ConfidenceDetail confidence={b.confidence} />
    </div>
  );
}

function DifficultyPanel({ b }: { b: DifficultyBreakdown }) {
  return (
    <div>
      <p className="text-sm">
        <strong className="text-lg tabular-nums">{b.value == null ? 'Limited data' : `${b.value.toFixed(1)}/10`}</strong>
        <span className="ml-2 text-xs text-subtle">{b.version}</span>
      </p>
      <ul className="mt-3 space-y-2.5">
        {b.components.map((c) => (
          <ComponentRow key={c.key} label={c.label} weight={c.weight} value={c.value} missingText="Unknown, not counted" detail={c.missing ? 'Not known; left out rather than assumed easy' : c.input} />
        ))}
      </ul>
      <ConfidenceDetail confidence={b.confidence} />
    </div>
  );
}

/** Expandable, fully transparent breakdown of Competition V1 and Difficulty V1. */
export function ScoreExplainer({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [window, setWindow] = useState<HistoryWindowId>(DEFAULT_HISTORY_WINDOW);
  const panelId = useId();
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useEventAnalytics(eventId, window, open);

  return (
    <section aria-label="How the scores are calculated" className="rounded-3xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold"
      >
        <Calculator className="size-4 text-brand-700" aria-hidden />
        <span className="flex-1">How it's calculated</span>
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-line px-4 pt-3 pb-4">
        {isPending ? (
          <div role="status" className="space-y-2">
            <span className="sr-only">Loading breakdown…</span>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <ErrorState error={error} title="Breakdown could not be loaded" onRetry={() => refetch()} />
        ) : (
          <div className={`space-y-6 ${isPlaceholderData ? 'opacity-60' : ''}`}>
            <div>
              <h3 className="text-sm font-bold">Competition Score</h3>
              <p className="mt-0.5 text-xs text-muted">Historical depth of the field: winner to top 10 and the top-10% cutoff, ranked against the other analysed events.</p>
              <div className="mt-2">
                <ChoiceChips label="Competition period" options={HISTORY_WINDOWS.map((w) => ({ value: w.id, label: w.label }))} value={window} onChange={setWindow} />
              </div>
              <div className="mt-3">{data.competition ? <CompetitionPanel b={data.competition} /> : <p className="text-sm text-muted">Not calculated yet.</p>}</div>
            </div>
            <div className="border-t border-line pt-4">
              <h3 className="text-sm font-bold">Course Difficulty</h3>
              <p className="mt-0.5 text-xs text-muted">Structural rating from known course facts only. Finishing times are not used.</p>
              <div className="mt-3">{data.difficulty ? <DifficultyPanel b={data.difficulty} /> : <p className="text-sm text-muted">Not calculated yet.</p>}</div>
            </div>
            <ul className="space-y-1 border-t border-line pt-3">
              {data.notes.map((n) => (
                <li key={n} className="text-[11px] text-subtle">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
