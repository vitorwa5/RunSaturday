/** Skeleton loaders. They keep layout stable while data loads instead of freezing the UI. */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200/80 ${className}`} aria-hidden />;
}

export function LoadingState({ label = 'Loading', variant = 'list', rows = 3 }: { label?: string; variant?: 'list' | 'card'; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {variant === 'card' ? (
        <div className="rounded-card border border-line bg-surface p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-48" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="mt-4 h-11 w-full rounded-full" />
        </div>
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        ))
      )}
    </div>
  );
}
