import { formatFinishTime, formatShortDate, type EventHistoryResponse, type OccurrenceSummary } from '@runsaturday/shared';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { formatCount } from '../../lib/display';

const time = (s: number | null) => (s == null ? 'Not available' : formatFinishTime(s));

/** Median placing times for the window, with the sample size always visible. */
export function HistoricalTimes({ history, windowLabel }: { history: EventHistoryResponse; windowLabel: string }) {
  const s = history.summary;
  const tiles = [
    { label: 'Median winner', value: time(s.medianWinnerSeconds) },
    { label: 'Median 3rd', value: time(s.medianThirdSeconds) },
    { label: 'Median 5th', value: time(s.medianFifthSeconds) },
    { label: 'Median 10th', value: time(s.medianTenthSeconds) },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface px-3 py-2.5">
            <dt className="text-xs font-semibold text-muted">{t.label}</dt>
            <dd className={`mt-0.5 font-bold tabular-nums ${t.value === 'Not available' ? 'text-sm text-subtle' : 'text-xl'}`}>{t.value}</dd>
          </div>
        ))}
      </dl>
      <SampleNote history={history} windowLabel={windowLabel} />
    </div>
  );
}

export function SampleNote({ history, windowLabel }: { history: EventHistoryResponse; windowLabel: string }) {
  const { eventsHeld, cancelled } = history.summary;
  return (
    <p className="mt-2 text-xs text-muted">
      Based on {eventsHeld} {eventsHeld === 1 ? 'event' : 'events'} {windowLabel}
      {cancelled > 0 && ` (${cancelled} cancelled ${cancelled === 1 ? 'date' : 'dates'} excluded)`}.
    </p>
  );
}

/** Explains when the requested window reaches back further than the stored data. */
export function CoverageNote({ history }: { history: EventHistoryResponse }) {
  const { firstDate, totalOccurrences } = history.coverage;
  if (!firstDate || (history.from != null && history.from >= firstDate)) return null;
  return (
    <p className="rounded-xl bg-info-bg px-3 py-2 text-xs text-info">
      Stored history starts on {formatShortDate(firstDate)} {firstDate.slice(0, 4)}, so this view shows all {totalOccurrences}{' '}
      stored {totalOccurrences === 1 ? 'date' : 'dates'}.
    </p>
  );
}

/**
 * Runners per event as simple CSS bars, oldest to newest. Purely a view of stored values
 * (no smoothing or trend lines); the table below carries the same data accessibly.
 */
export function ParticipantsChart({ occurrences }: { occurrences: OccurrenceSummary[] }) {
  const chronological = [...occurrences].reverse();
  const counts = chronological.map((o) => o.participantCount ?? 0);
  const max = Math.max(...counts, 1);
  if (chronological.length === 0) return null;
  const first = chronological[0]!.date;
  const last = chronological.at(-1)!.date;

  return (
    <figure className="rounded-2xl border border-line bg-surface p-3">
      <figcaption className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-semibold">Runners per event</span>
        <span className="text-subtle">max {formatCount(max)}</span>
      </figcaption>
      <div className="flex h-24 items-end gap-[3px]" aria-hidden>
        {chronological.map((o) =>
          o.status === 'cancelled' ? (
            <div key={o.date} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${formatShortDate(o.date)}: cancelled`}>
              <span className="text-[10px] leading-none font-bold text-problem">×</span>
            </div>
          ) : (
            <div
              key={o.date}
              className="min-w-0 flex-1 rounded-t-sm bg-brand-500/80"
              style={{ height: `${Math.max(4, ((o.participantCount ?? 0) / max) * 100)}%` }}
              title={`${formatShortDate(o.date)}: ${formatCount(o.participantCount)} runners`}
            />
          ),
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-subtle" aria-hidden>
        <span>{formatShortDate(first)}</span>
        <span>{formatShortDate(last)}</span>
      </div>
      <p className="sr-only">
        Runners per event from {formatShortDate(first)} to {formatShortDate(last)}; the table below lists every value.
      </p>
    </figure>
  );
}

const INITIAL_ROWS = 8;

export function OccurrenceTable({ occurrences }: { occurrences: OccurrenceSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? occurrences : occurrences.slice(0, INITIAL_ROWS);
  return (
    <div>
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">Results by date, most recent first</caption>
        <thead className="bg-canvas text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Date</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Runners</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">1st</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">10th</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((o) => (
            <tr key={o.date}>
              <th scope="row" className="px-3 py-2 text-left font-medium">{formatShortDate(o.date)}</th>
              {o.status === 'cancelled' ? (
                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-problem">
                  Cancelled
                </td>
              ) : (
                <>
                  <td className="px-3 py-2 text-right">{formatCount(o.participantCount)}</td>
                  <td className="px-3 py-2 text-right">{o.winnerTimeSeconds == null ? '—' : formatFinishTime(o.winnerTimeSeconds)}</td>
                  <td className="px-3 py-2 text-right">{o.tenthTimeSeconds == null ? '—' : formatFinishTime(o.tenthTimeSeconds)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      {occurrences.length > INITIAL_ROWS && (
        <Button variant="ghost" className="mt-1 w-full" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer dates' : `Show all ${occurrences.length} dates`}
        </Button>
      )}
    </div>
  );
}
