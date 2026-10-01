import { competitionBand, difficultyBand, formatDifficulty, formatScore, opportunityBand, type Band } from '../../lib/display';
import { TONE_CLASSES } from './tone';

export type ScoreKind = 'opportunity' | 'competition' | 'difficulty';

const BAND_FOR: Record<ScoreKind, (s: number | null | undefined) => Band> = {
  opportunity: opportunityBand,
  competition: competitionBand,
  difficulty: difficultyBand,
};

interface ScoreBadgeProps {
  /** Short visible label, e.g. "PB". */
  label: string;
  score: number | null | undefined;
  kind?: ScoreKind;
  /** Show the band word ("Excellent") next to the number. */
  showBand?: boolean;
}

/** Compact score pill. The number and label carry the meaning; colour only reinforces it. */
export function ScoreBadge({ label, score, kind = 'opportunity', showBand = false }: ScoreBadgeProps) {
  const band = BAND_FOR[kind](score);
  const value = kind === 'difficulty' ? formatDifficulty(score) : formatScore(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[band.tone]}`}
      title={`${label}: ${value} (${band.label})`}
    >
      <span className="font-medium opacity-90">{label}</span>
      <span className="tabular-nums">{value}</span>
      {showBand ? <span className="font-medium">· {band.label}</span> : <span className="sr-only">({band.label})</span>}
    </span>
  );
}
