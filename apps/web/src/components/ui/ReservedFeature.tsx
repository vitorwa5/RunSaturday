import type { LucideIcon } from 'lucide-react';

/** A polished placeholder for a section that arrives in a later phase. */
export function ReservedFeature({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line bg-surface p-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-subtle">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{description}</p>
        <p className="mt-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Coming in a later phase</p>
      </div>
    </div>
  );
}
