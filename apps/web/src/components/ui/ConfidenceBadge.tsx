import type { ConfidenceLevel } from '@runsaturday/shared';
import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CONFIDENCE_DISPLAY, CONFIDENCE_SHORT } from '../../lib/display';
import { TONE_CLASSES } from './tone';

const ICONS = { high: ShieldCheck, medium: ShieldAlert, low: ShieldAlert, insufficient: CircleHelp };

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Sample size is always shown when known. */
  sampleSize?: number;
  windowDays?: number;
  /** Short label ("High") for dense cards; the full label stays available to screen readers. */
  compact?: boolean;
}

export function ConfidenceBadge({ level, sampleSize, windowDays, compact = false }: ConfidenceBadgeProps) {
  const display = CONFIDENCE_DISPLAY[level];
  const Icon = ICONS[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[display.tone]}`}>
      <Icon className="size-3.5" aria-hidden />
      {compact && level !== 'insufficient' ? (
        <>
          {CONFIDENCE_SHORT[level]}
          <span className="sr-only"> confidence</span>
        </>
      ) : (
        display.label
      )}
      {sampleSize != null && (
        <span className="font-normal">
          · {sampleSize} {sampleSize === 1 ? 'event' : 'events'}
          {windowDays != null && ` / ${windowDays}d`}
        </span>
      )}
    </span>
  );
}
