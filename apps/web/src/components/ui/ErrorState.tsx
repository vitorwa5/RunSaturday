import { CloudOff } from 'lucide-react';
import { ApiError } from '../../api/client';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  /** Context for the user, e.g. "Events could not be loaded." */
  title?: string;
  onRetry?: () => void;
}

/** Shows a safe, human message. Raw technical errors are never rendered. */
export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  const message = error instanceof ApiError ? error.message : 'Please try again in a moment.';
  return (
    <div role="alert" className="rounded-card border border-problem/20 bg-problem-bg p-4">
      <div className="flex items-start gap-3">
        <CloudOff className="mt-0.5 size-5 shrink-0 text-problem" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-problem">{title}</p>
          <p className="mt-1 text-sm text-ink">{message}</p>
          {onRetry && (
            <Button variant="secondary" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
