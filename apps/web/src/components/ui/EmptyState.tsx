import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Explain what is happening, not just that there is nothing. */
  description: ReactNode;
  /** A useful next action. */
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-8 text-center">
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1 max-w-xs text-sm text-muted">{description}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
