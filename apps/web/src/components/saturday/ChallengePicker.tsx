import type { SaturdayChallengeContext } from '@runsaturday/shared';
import { Link } from 'react-router';
import { ChoiceChips } from '../ui/ChoiceChips';
import { ProgressBar } from '../explore/ChallengeProgressCard';

/**
 * Complete a challenge: which challenge (only shown when there is a choice) and which missing
 * item. Only items that an event in the current dataset would complete are offered; the rest
 * are counted honestly rather than listed as dead ends.
 */
export function ChallengePicker({
  context,
  onChange,
}: {
  context: SaturdayChallengeContext;
  onChange: (next: { challenge: string; item?: string }) => void;
}) {
  // Items an event in the dataset would complete, plus the chosen one (e.g. from a shared link).
  const findable = context.missingItems.filter((i) => i.opportunities > 0 || i.key === context.itemKey);
  const unfindable = context.missingItems.filter((i) => i.opportunities === 0).length;
  const { current, target, percentage } = context.progress;
  return (
    <section aria-label="Challenge choice" className="space-y-2.5 rounded-2xl border border-line bg-surface p-3">
      {context.challenges.length > 1 && (
        <ChoiceChips label="Challenge" scroll options={context.challenges.map((c) => ({ value: c.id, label: c.name }))} value={context.challengeId} onChange={(id) => onChange({ challenge: id })} />
      )}
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <Link to={`/challenges/${context.challengeId}`} className="font-semibold text-brand-700">
            {context.challengeName}
          </Link>
          <span className="font-bold tabular-nums">
            {current} / {target}
          </span>
        </div>
        <div className="mt-1.5">
          <ProgressBar label={`${context.challengeName} progress`} percentage={percentage} />
        </div>
      </div>
      {findable.length > 0 ? (
        <ChoiceChips
          label="Missing item"
          options={[{ value: '', label: 'Any missing' }, ...findable.map((i) => ({ value: i.key, label: i.label }))]}
          value={context.itemKey ?? ''}
          onChange={(key) => onChange({ challenge: context.challengeId, ...(key ? { item: key } : {}) })}
        />
      ) : (
        <p className="text-xs text-muted">No missing item can be completed at an event in the current dataset.</p>
      )}
      {unfindable > 0 && (
        <p className="text-xs text-subtle">
          {unfindable} missing {unfindable === 1 ? 'item has' : 'items have'} no event in the current 5K Compass dataset.
        </p>
      )}
    </section>
  );
}
