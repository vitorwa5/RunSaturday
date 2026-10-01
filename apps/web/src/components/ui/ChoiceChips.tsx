import { Check } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  /** Disabled options stay visible with a short reason, e.g. "Later". */
  disabled?: boolean;
  hint?: string;
}

interface ChoiceChipsProps<T extends string | number> {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Scroll horizontally on one line instead of wrapping. */
  scroll?: boolean;
}

/**
 * Single-select chip group (WAI-ARIA radio group). The selected chip shows a check icon and
 * bold text, so selection never relies on colour alone.
 */
export function ChoiceChips<T extends string | number>({ label, options, value, onChange, scroll = false }: ChoiceChipsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta || enabled.length === 0) return;
    e.preventDefault();
    const pos = enabled.indexOf(index);
    const next = enabled[(pos + delta + enabled.length) % enabled.length]!;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={scroll ? 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1' : 'flex flex-wrap gap-2'}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-subtle ${
              selected
                ? 'border-brand-700 bg-brand-50 font-bold text-brand-800'
                : 'border-line bg-surface font-medium text-ink hover:bg-zinc-50'
            }`}
          >
            {selected && <Check className="size-4" strokeWidth={2.75} aria-hidden />}
            {option.label}
            {option.hint && <span className="text-[11px] font-semibold tracking-wide uppercase">· {option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
