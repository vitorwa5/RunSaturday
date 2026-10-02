import type { EventDetail } from '@runsaturday/shared';
import { Gauge, Mountain, Users } from 'lucide-react';
import {
  competitionBand,
  difficultyBand,
  formatCount,
  formatDifficulty,
  factorPhrase,
  formatFactor,
  formatScore,
  LIMITED_MATCHED,
  opportunityBand,
  pbLabel,
  PB_UNAVAILABLE,
  type Band,
} from '../../lib/display';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { TONE_CLASSES } from '../ui/tone';

function Primary({ label, value, scale, band }: { label: string; value: string; scale: string; band: Band }) {
  return (
    <div className="flex flex-col items-center px-1 py-3 text-center">
      <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{value}</dd>
      <dd className="text-xs font-medium text-subtle">{scale}</dd>
      <dd className={`mt-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE_CLASSES[band.tone]}`}>{band.label}</dd>
    </div>
  );
}

/** Three primary scores with strong hierarchy, then a single secondary strip. */
export function EventHeroMetrics({ event }: { event: EventDetail }) {
  const s = event.scores;
  return (
    <section aria-label="Key metrics" className="overflow-hidden rounded-3xl border border-line bg-surface">
      <dl className="grid grid-cols-3 divide-x divide-line">
        {s?.pbScore != null ? (
          <Primary label={pbLabel()} value={formatScore(s.pbScore)} scale="out of 100" band={opportunityBand(s.pbScore)} />
        ) : (
          <Primary label={pbLabel()} value="—" scale={PB_UNAVAILABLE} band={{ label: LIMITED_MATCHED, tone: 'neutral' }} />
        )}
        <Primary label="Difficulty" value={formatDifficulty(s?.difficultyScore)} scale="out of 10" band={difficultyBand(s?.difficultyScore)} />
        <Primary label="Competition" value={formatScore(s?.competitionScore)} scale="out of 100" band={competitionBand(s?.competitionScore)} />
      </dl>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/60 px-4 py-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Users className="size-4 text-subtle" aria-hidden />
          <dt className="sr-only">Average participants</dt>
          <dd>
            <strong className="font-bold tabular-nums">{formatCount(event.averageParticipants)}</strong> <span className="text-muted">avg runners</span>
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Mountain className="size-4 text-subtle" aria-hidden />
          <dt className="sr-only">Elevation</dt>
          <dd>
            {event.elevationM != null ? (
              <>
                <strong className="font-bold tabular-nums">{event.elevationM} m</strong> <span className="text-muted">elevation</span>
              </>
            ) : (
              <span className="text-muted">Elevation unknown</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="size-4 text-subtle" aria-hidden />
          <dt className="sr-only">Course Speed Factor</dt>
          <dd>
            {s?.courseSpeedFactor != null ? (
              <>
                <strong className="font-bold tabular-nums">{formatFactor(s.courseSpeedFactor)}</strong>{' '}
                <span className="text-muted">course speed · {factorPhrase(s.courseSpeedFactor)}</span>
              </>
            ) : (
              <span className="text-muted">Course speed: {LIMITED_MATCHED.toLowerCase()}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="sr-only">PB Score confidence</dt>
          <dd>
            <ConfidenceBadge level={s?.pbConfidence ?? 'insufficient'} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
