import { GOALS, goalDefinition, type Goal } from '@runsaturday/shared';
import { Check, Flag, Gem, MapPinPlus, Medal, Shuffle, Timer, Wind, type LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

export const INTENT_ICONS: Record<Goal, LucideIcon> = {
  pb: Timer,
  place: Medal,
  new_event: MapPinPlus,
  challenge: Flag,
  quiet: Wind,
  hidden_gem: Gem,
  surprise: Shuffle,
};

interface IntentSelectorProps {
  value: Goal;
  onChange: (intent: Goal) => void;
  label?: string;
}

/**
 * "What are you looking for this Saturday?" as one radio group (arrow keys move between
 * options). Six compact intents in two columns, then a lighter full-width "Surprise me", and
 * the selected intent's one-line explanation underneath. A per-Saturday choice, not a profile.
 */
export function IntentSelector({ value, onChange, label = 'What are you looking for this Saturday?' }: IntentSelectorProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + GOALS.length) % GOALS.length;
    onChange(GOALS[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {GOALS.map((intent, i) => {
          const selected = intent.id === value;
          const Icon = INTENT_ICONS[intent.id];
          const isSurprise = intent.id === 'surprise';
          return (
            <button
              key={intent.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-describedby={selected ? 'intent-description' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(intent.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 text-left text-sm leading-tight transition-colors ${isSurprise ? 'col-span-2 justify-center' : ''} ${
                selected
                  ? 'border-2 border-brand-700 bg-brand-50 font-bold text-brand-800'
                  : isSurprise
                    ? 'border-dashed border-line bg-transparent font-medium text-muted hover:bg-zinc-50'
                    : 'border-line bg-surface font-medium text-ink hover:bg-zinc-50'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{intent.label}</span>
              {selected && <Check className={`size-4 shrink-0 ${isSurprise ? '' : 'ml-auto'}`} strokeWidth={3} aria-hidden />}
            </button>
          );
        })}
      </div>
      <p id="intent-description" className="mt-2 text-sm text-muted" aria-live="polite">
        <strong className="font-semibold text-ink">{goalDefinition(value).longLabel}.</strong> {goalDefinition(value).description}
      </p>
    </div>
  );
}
