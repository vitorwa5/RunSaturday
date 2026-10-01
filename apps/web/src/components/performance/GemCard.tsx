import type { HiddenGem } from '@runsaturday/shared';
import { Car, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { ReasonList } from '../events/ReasonList';
import { Button, ButtonLink } from '../ui/Button';
import { DemoBadge } from '../ui/DemoBadge';

/** A Hidden Gem: score, why it's a gem, and an expandable, fully transparent breakdown. */
export function GemCard({ gem }: { gem: HiddenGem }) {
  const { rank, event, gemScore, components, reasons } = gem;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdownId = useId();
  const positives = reasons.filter((r) => r.tone === 'positive').slice(0, 4);
  const cautions = reasons.filter((r) => r.tone === 'caution');

  return (
    <article aria-label={`Gem ${rank}: ${event.name}`} className="rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_4px_rgba(24,24,27,0.05)]">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <h3 className="text-lg leading-tight font-bold">{event.name}</h3>
            {event.source === 'demo' && <DemoBadge />}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {event.town && <span>{event.town}</span>}
            {event.travel && (
              <span className="inline-flex items-center gap-1" title="Estimated from straight-line distance">
                <Car className="size-3.5" aria-hidden />~{event.travel.minutes} min
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Gem score</p>
          <p className="text-3xl leading-none font-extrabold tabular-nums">
            {gemScore}
            <span className="ml-0.5 text-sm font-semibold text-subtle">/100</span>
          </p>
        </div>
      </header>

      <div className="mt-3">
        <h4 className="mb-1.5 text-sm font-semibold">Why it's a gem</h4>
        <ReasonList reasons={[...positives, ...cautions]} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <ButtonLink to={`/event/${event.id}`} variant="secondary" className="min-h-10">
          View event
        </ButtonLink>
        <Button variant="secondary" className="min-h-10" aria-expanded={showBreakdown} aria-controls={breakdownId} onClick={() => setShowBreakdown((v) => !v)}>
          Breakdown
          <ChevronDown className={`size-4 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} aria-hidden />
        </Button>
      </div>
      <div id={breakdownId} hidden={!showBreakdown} className="mt-3 rounded-2xl bg-canvas p-3">
        <ul className="space-y-2.5">
          {components.map((c) => (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{c.label}</span>
                <span className="font-bold tabular-nums">+{c.contribution}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.value}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-subtle">
                <span className="tabular-nums">
                  {c.value}/100 × {Math.round(c.weight * 100)}%
                </span>{' '}
                · {c.basis}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          Gem score = weighted sum of the parts above, rounded: <strong className="text-ink">{gemScore}</strong>.
        </p>
      </div>
    </article>
  );
}
