import type { TravelEstimate } from '@runsaturday/shared';
import { Car } from 'lucide-react';

/** Travel time, always marked as an estimate. */
export function TravelBadge({ travel }: { travel: TravelEstimate | undefined }) {
  if (!travel) {
    return <span className="text-xs text-subtle">Travel unknown</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-muted whitespace-nowrap"
      title={`Estimated from straight-line distance (${travel.distanceKm} km)`}
    >
      <Car className="size-3.5" aria-hidden />
      <span className="tabular-nums">~{travel.minutes} min</span>
      <span className="sr-only">estimated travel</span>
    </span>
  );
}
