import type { RecommendationReason } from '@runsaturday/shared';
import { Check, TriangleAlert } from 'lucide-react';

/** "Why this?" explanation list. Each line has an icon and text, never colour alone. */
export function ReasonList({ reasons }: { reasons: RecommendationReason[] }) {
  if (reasons.length === 0) return <p className="text-sm text-muted">No explanation available.</p>;
  return (
    <ul className="space-y-1.5">
      {reasons.map((r) => (
        <li key={r.text} className="flex items-start gap-2 text-sm">
          {r.tone === 'positive' ? (
            <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-label="In favour:" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-caution" aria-label="Caution:" />
          )}
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
