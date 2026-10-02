import { formatFinishTime, RUNNER_TIME_SOURCES, type RunnerTimeSourceId, type UserProfile } from '@runsaturday/shared';
import { useId, useState, type FormEvent } from 'react';
import { resolveRunnerTime, validateManualTime } from '../../lib/runnerTime';
import { Button } from '../ui/Button';
import { ChoiceChips } from '../ui/ChoiceChips';

interface RunnerTimePickerProps {
  profile: UserProfile | undefined;
  source: RunnerTimeSourceId;
  manualSeconds: number | null;
  onSourceChange: (source: RunnerTimeSourceId) => void;
  onManualSubmit: (seconds: number) => void;
}

/** Choose the 5K time to analyse: from the profile, or typed in (validated). */
export function RunnerTimePicker({ profile, source, manualSeconds, onSourceChange, onManualSubmit }: RunnerTimePickerProps) {
  const [input, setInput] = useState(manualSeconds != null ? formatFinishTime(manualSeconds) : '');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const options = RUNNER_TIME_SOURCES.map((s) => {
    if (s.id === 'manual') return { value: s.id, label: s.label };
    const seconds = resolveRunnerTime(s.id, profile, null);
    // Current Form is a modelled estimate, shown with "≈".
    const time = seconds != null ? `${s.id === 'current' ? '≈ ' : ''}${formatFinishTime(seconds)}` : null;
    return { value: s.id, label: time != null ? `${s.label} ${time}` : s.label, disabled: profile != null && seconds == null };
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateManualTime(input);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onManualSubmit(result.seconds);
  };

  return (
    <div className="space-y-3">
      <ChoiceChips label="Time to analyse" options={options} value={source} onChange={onSourceChange} />
      {source === 'manual' && (
        <form onSubmit={submit} noValidate className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              Your 5K time
            </label>
            <input
              id={inputId}
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 19:30"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={error != null}
              aria-describedby={error ? errorId : undefined}
              className={`min-h-11 w-full rounded-full border bg-surface px-4 text-base tabular-nums placeholder:text-subtle focus:outline-none ${
                error ? 'border-problem' : 'border-line focus:border-brand-700'
              }`}
            />
            {error && (
              <p id={errorId} role="alert" className="mt-1.5 px-1 text-sm font-medium text-problem">
                {error}
              </p>
            )}
          </div>
          <Button type="submit">Show</Button>
        </form>
      )}
    </div>
  );
}
