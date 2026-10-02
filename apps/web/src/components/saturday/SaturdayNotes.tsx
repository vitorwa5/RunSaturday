import type { SaturdayRecommendationsResponse } from '@runsaturday/shared';
import { Info } from 'lucide-react';

/** What the intent applied by itself, honest caveats, and why candidates are missing. */
export function SaturdayNotes({ data, compact = false }: { data: SaturdayRecommendationsResponse; compact?: boolean }) {
  const lines = [...data.defaultsApplied, ...data.limitations, ...(compact ? [] : data.exclusions)];
  if (lines.length === 0) return null;
  return (
    <ul aria-label="About these results" className="space-y-1">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {line}
        </li>
      ))}
    </ul>
  );
}
