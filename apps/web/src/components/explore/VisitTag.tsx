import { Check, Sparkle } from 'lucide-react';

/** Subtle visit indicator, derived from the user's performances. Nothing when unknown. */
export function VisitTag({ visited }: { visited: boolean | undefined }) {
  if (visited == null) return null;
  return visited ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-muted">
      <Check className="size-3" aria-hidden />
      Visited
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
      <Sparkle className="size-3" aria-hidden />
      New to you
    </span>
  );
}
