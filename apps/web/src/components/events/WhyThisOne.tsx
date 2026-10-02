import type { DataConfidenceNote } from '@runsaturday/shared';
import { Check } from 'lucide-react';
import { CONFIDENCE_DISPLAY } from '../../lib/display';
import { TONE_CLASSES } from '../ui/tone';

/** "Why this one": the 2–4 concise reasons the orchestrator gives for a recommendation. */
export function WhyThisOne({ why, label = 'Why this one', compact = false }: { why: string[]; label?: string; compact?: boolean }) {
  return (
    <ul aria-label={label} className={`space-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      {why.map((w) => (
        <li key={w} className="flex items-start gap-1.5">
          <Check className={`mt-0.5 shrink-0 text-positive ${compact ? 'size-3' : 'size-3.5'}`} strokeWidth={3} aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

/** "High data confidence", with what it is about in the tooltip and for screen readers. */
export function DataConfidencePill({ note }: { note: DataConfidenceNote }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[CONFIDENCE_DISPLAY[note.level].tone]}`} title={note.basis}>
      {note.label}
      <span className="sr-only">: {note.basis}</span>
    </span>
  );
}
