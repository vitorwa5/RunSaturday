import type { ButtonHTMLAttributes } from 'react';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Toggleable chip. Selection is conveyed by aria-pressed, weight and border, not colour alone. */
export function FilterChip({ selected = false, className = '', children, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-brand-700 bg-brand-50 font-semibold text-brand-800'
          : 'border-line bg-surface font-medium text-ink hover:bg-zinc-50'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
