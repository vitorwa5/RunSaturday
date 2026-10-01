import type { EventFacilities, FacilityStatus } from '@runsaturday/shared';
import { Check, CircleHelp, X, type LucideIcon } from 'lucide-react';
import { FACILITY_LABEL } from '../../lib/display';

const ICON: Record<FacilityStatus, LucideIcon> = { yes: Check, no: X, unknown: CircleHelp };
const STYLE: Record<FacilityStatus, string> = {
  yes: 'bg-positive-bg text-positive',
  no: 'bg-zinc-100 text-ink',
  unknown: 'bg-zinc-100 text-muted',
};

const ROWS: { key: keyof EventFacilities; label: string }[] = [
  { key: 'parking', label: 'Parking' },
  { key: 'toilets', label: 'Toilets' },
  { key: 'cafe', label: 'Cafe' },
  { key: 'dogs', label: 'Dogs' },
  { key: 'buggies', label: 'Buggies' },
  { key: 'accessibility', label: 'Accessibility' },
];

/** Facilities as stated in the data; "Unknown" is shown as such, never inferred. */
export function FacilityList({ facilities }: { facilities: EventFacilities }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {ROWS.map(({ key, label }) => {
        const status = facilities[key];
        const Icon = ICON[status];
        return (
          <li key={key} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5">
            <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${STYLE[status]}`}>
              <Icon className="size-4" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className={`block text-xs ${status === 'unknown' ? 'text-subtle' : 'text-muted'}`}>{FACILITY_LABEL[status]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
