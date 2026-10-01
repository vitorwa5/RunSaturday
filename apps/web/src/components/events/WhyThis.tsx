import type { RecommendationReason } from '@runsaturday/shared';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { ReasonList } from './ReasonList';

export function WhyThisButton({
  open,
  controls,
  onToggle,
  className,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button variant="secondary" aria-expanded={open} aria-controls={controls} onClick={onToggle} className={className}>
      Why this?
      <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
    </Button>
  );
}

/** Expandable "Recommended because" panel. Rendered hidden (not removed) for aria-controls. */
export function WhyThisPanel({ id, open, reasons, footer }: { id: string; open: boolean; reasons: RecommendationReason[]; footer?: ReactNode }) {
  return (
    <div id={id} hidden={!open} className="mt-3 rounded-2xl bg-canvas p-3">
      <h3 className="mb-2 text-sm font-semibold">Recommended because</h3>
      <ReasonList reasons={reasons} />
      {footer && <div className="mt-3 text-xs text-subtle">{footer}</div>}
    </div>
  );
}
