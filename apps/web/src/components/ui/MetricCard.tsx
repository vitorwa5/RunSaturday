import type { ReactNode } from 'react';
import type { Band } from '../../lib/display';
import { TONE_CLASSES } from './tone';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** Suffix such as "/ 100". */
  suffix?: string;
  band?: Band;
  hint?: ReactNode;
}

export function MetricCard({ label, value, suffix, band, hint }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value}
        {suffix && <span className="ml-1 text-sm font-medium text-subtle">{suffix}</span>}
      </p>
      {band && (
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[band.tone]}`}>
          {band.label}
        </span>
      )}
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
