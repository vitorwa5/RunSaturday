import { GOALS, type Goal } from '@runsaturday/shared';
import { Check, Flag, Gem, MapPinPlus, Medal, Timer, Wind, type LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

const GOAL_ICONS: Record<Goal, LucideIcon> = {
  pb: Timer,
  place: Medal,
  hidden_gem: Gem,
  new_event: MapPinPlus,
  quiet: Wind,
  challenge: Flag,
};

interface GoalSelectorProps {
  value: Goal;
  onChange: (goal: Goal) => void;
  /** "short" labels for Home, "long" labels (e.g. "High Finish") for the Planner. */
  labels?: 'short' | 'long';
  label?: string;
  /** Goals to tag "Soon" (default: goals the planner cannot rank yet). */
  isSoon?: (goal: Goal) => boolean;
}

/**
 * Radio group of Saturday objectives (arrow keys move between options). The selected goal
 * has a check badge, bold text and a thicker border. Goals not supported yet stay
 * selectable (so the app can explain why) and carry a "Soon" tag.
 */
export function GoalSelector({ value, onChange, labels = 'short', label = 'What do you want this Saturday?', isSoon = (g) => !GOALS.find((x) => x.id === g)!.available }: GoalSelectorProps) {
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
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {GOALS.map((goal, i) => {
        const selected = goal.id === value;
        const Icon = GOAL_ICONS[goal.id];
        return (
          <button
            key={goal.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={goal.description}
            onClick={() => onChange(goal.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-[13px] leading-tight transition-colors ${
              selected
                ? 'border-2 border-brand-700 bg-brand-50 font-bold text-brand-800'
                : 'border-line bg-surface font-medium text-ink hover:bg-zinc-50'
            }`}
          >
            {selected && (
              <span className="absolute top-1.5 right-1.5 inline-flex size-4 items-center justify-center rounded-full bg-brand-700 text-white">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
            )}
            <Icon className="size-5" aria-hidden />
            <span className="text-center">{labels === 'long' ? goal.longLabel : goal.label}</span>
            {isSoon(goal.id) && <span className="text-[10px] font-semibold tracking-wide text-subtle uppercase">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}
