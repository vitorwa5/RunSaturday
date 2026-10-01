import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tone } from '../../lib/display';
import { TONE_CLASSES } from './tone';

const ICONS: Record<Tone, LucideIcon> = {
  positive: CircleCheck,
  caution: TriangleAlert,
  problem: CircleAlert,
  info: Info,
  neutral: Info,
};

interface AlertBannerProps {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}

export function AlertBanner({ tone = 'info', title, children }: AlertBannerProps) {
  const Icon = ICONS[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-3 ${TONE_CLASSES[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-ink">{children}</div>}
      </div>
    </div>
  );
}
