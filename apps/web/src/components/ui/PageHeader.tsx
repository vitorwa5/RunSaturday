import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Show a back button (for pages reached from another screen). */
  back?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back = false, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="flex items-start gap-3 pt-4 pb-2">
      {back && (
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-zinc-100"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

/** Section heading used inside pages. */
export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}
