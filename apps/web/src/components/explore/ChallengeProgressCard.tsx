import type { ChallengeResult, ChallengeStatus } from '@runsaturday/shared';
import { ChevronRight, Flag } from 'lucide-react';
import { Link } from 'react-router';
import { CHALLENGE_STATUS_LABEL } from '../../lib/display';

interface ChallengeProgressCardProps {
  challenge: { id: string; name: string; status: ChallengeStatus; progress: ChallengeResult['progress'] };
  description?: string;
  compact?: boolean;
}

export function ProgressBar({ label, percentage }: { label: string; percentage: number }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} className="h-2 overflow-hidden rounded-full bg-zinc-100">
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${percentage}%` }} />
    </div>
  );
}

/** One challenge's progress, linking to its detail page. Works for any challenge kind. */
export function ChallengeProgressCard({ challenge, description, compact = false }: ChallengeProgressCardProps) {
  const { current, target, percentage } = challenge.progress;
  return (
    <Link
      to={`/challenges/${challenge.id}`}
      aria-label={`${challenge.name}: ${current} of ${target} completed, ${percentage}%. Open challenge details`}
      className={`block rounded-2xl border border-line bg-surface transition-colors hover:bg-zinc-50 active:bg-zinc-100 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Flag className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-semibold">{challenge.name}</h3>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {current} / {target}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
            <span>{CHALLENGE_STATUS_LABEL[challenge.status]}</span>
            <span className="tabular-nums">{percentage}%</span>
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />
      </div>
      <div className="mt-2.5">
        <ProgressBar label={`${challenge.name} progress`} percentage={percentage} />
      </div>
      {description && !compact && <p className="mt-2 text-xs text-muted">{description}</p>}
    </Link>
  );
}
