import type { Tone } from '../../lib/display';

/** Background + text classes per tone. Text colours meet WCAG AA on their backgrounds. */
export const TONE_CLASSES: Record<Tone, string> = {
  positive: 'bg-positive-bg text-positive',
  caution: 'bg-caution-bg text-caution',
  problem: 'bg-problem-bg text-problem',
  info: 'bg-info-bg text-info',
  neutral: 'bg-zinc-100 text-muted',
};
