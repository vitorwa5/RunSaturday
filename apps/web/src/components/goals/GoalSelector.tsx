import { GOALS, type Goal } from '@runsaturday/shared';
import { Flag, Gem, Medal, MapPinPlus, Timer, Wind, type LucideIcon } from 'lucide-react';
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
}

/** Radio group of Saturday objectives (arrow keys move between options). */
export function GoalSelector({ value, onChange }: GoalSelectorProps) {
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
    <div role="radiogroup" aria-label="What do you want this Saturday?" className="grid grid-cols-3 gap-2">
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
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-xs transition-colors ${
              selected
                ? 'border-brand-700 bg-brand-50 font-bold text-brand-800 ring-1 ring-brand-700'
                : 'border-line bg-surface font-medium text-ink hover:bg-zinc-50'
            }`}
          >
            <Icon className="size-5" aria-hidden />
            {goal.label}
          </button>
        );
      })}
    </div>
  );
}
