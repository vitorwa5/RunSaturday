/**
 * Presentation mappings: how values are labelled and toned in the UI.
 * No scoring maths lives here, only display thresholds and wording.
 */
import { ordinal, type PerformanceSource, type ConfidenceLevel, type CourseType, type FacilityStatus, type HistoricalFrequency, type Recommendation, type Surface } from '@runsaturday/shared';

export type Tone = 'positive' | 'caution' | 'problem' | 'info' | 'neutral';

export interface Band {
  label: string;
  tone: Tone;
}

/** Scores where higher is better for the runner (PB Score, Gem Score). */
export function opportunityBand(score: number | null | undefined): Band {
  if (score == null) return { label: 'No score', tone: 'neutral' };
  if (score >= 85) return { label: 'Excellent', tone: 'positive' };
  if (score >= 65) return { label: 'Good', tone: 'caution' };
  return { label: 'Low', tone: 'problem' };
}

/** Competition is not good or bad in itself, so it uses informational tones only. */
export function competitionBand(score: number | null | undefined): Band {
  if (score == null) return { label: 'Limited data', tone: 'neutral' };
  if (score >= 70) return { label: 'High', tone: 'info' };
  if (score >= 45) return { label: 'Medium', tone: 'info' };
  return { label: 'Lower', tone: 'info' };
}

/** Difficulty on the 1–10 scale (higher = harder). */
export function difficultyBand(score: number | null | undefined): Band {
  if (score == null) return { label: 'Limited data', tone: 'neutral' };
  if (score <= 3.5) return { label: 'Easy', tone: 'positive' };
  if (score <= 6.5) return { label: 'Moderate', tone: 'caution' };
  return { label: 'Hard', tone: 'problem' };
}

export const CONFIDENCE_DISPLAY: Record<ConfidenceLevel, Band> = {
  high: { label: 'High confidence', tone: 'positive' },
  medium: { label: 'Medium confidence', tone: 'caution' },
  low: { label: 'Low confidence', tone: 'caution' },
  insufficient: { label: 'Limited data', tone: 'neutral' },
};

/** Short confidence labels for compact cards. */
export const CONFIDENCE_SHORT: Record<ConfidenceLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  insufficient: 'Limited data',
};

/** Band for the metric a recommendation was ranked by (null when a band would add nothing). */
export function rankedByBand(rankedBy: Recommendation['rankedBy']): Band | null {
  switch (rankedBy.key) {
    case 'pb_score':
    case 'gem_score':
      return opportunityBand(rankedBy.value);
    case 'competition_score':
      return competitionBand(rankedBy.value);
    default:
      return null;
  }
}

export const SURFACE_LABEL: Record<Surface, string> = {
  tarmac: 'Tarmac',
  trail: 'Trail',
  grass: 'Grass',
  mixed: 'Mixed',
  unknown: 'Unknown',
};

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  one_lap: '1 lap',
  two_laps: '2 laps',
  three_plus_laps: '3+ laps',
  out_and_back: 'Out and back',
  point_to_point: 'Point to point',
  unknown: 'Unknown',
};

export const FACILITY_LABEL: Record<FacilityStatus, string> = {
  yes: 'Yes',
  no: 'No',
  unknown: 'Unknown',
};

export const formatScore = (score: number | null | undefined) => (score == null ? '—' : String(Math.round(score)));
export const formatDifficulty = (score: number | null | undefined) => (score == null ? '—' : score.toFixed(1));
export const formatMeters = (m: number | null | undefined) => (m == null ? 'Unknown' : `${m} m`);
export const formatCount = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-GB'));

/** "5th–8th", or "4th" when both ends are equal. */
export function formatPlacementRange(range: { low: number; high: number }): string {
  return range.low === range.high ? ordinal(range.low) : `${ordinal(range.low)}–${ordinal(range.high)}`;
}

/** "10 of 12 events": a historical count, never a probability. */
export function formatFrequency(f: HistoricalFrequency): string {
  return `${f.count} of ${f.of} ${f.of === 1 ? 'event' : 'events'}`;
}

/** PB Score label (pb_v1, calculated from course factors for demo and imported data alike). */
export const pbLabel = (short = false) => (short ? 'PB' : 'PB Score');

export const PB_UNAVAILABLE = 'PB Score unavailable';
export const LIMITED_MATCHED = 'Limited matched-runner data';

/** Course Speed Factor, three decimals ("0.969"). */
export const formatFactor = (f: number | null | undefined) => (f == null ? '—' : f.toFixed(3));

/**
 * Course Speed Factors are centred on the geometric mean of the analysed cohort, so 1.000 is a
 * cohort reference, not a physically neutral 5K. Wording is therefore relative to that cohort
 * and never "x% faster than a neutral course".
 */
export function factorPhrase(f: number | null | undefined): string {
  if (f == null) return LIMITED_MATCHED;
  if (Math.abs(f - 1) < 0.0025) return 'Close to the analysed course cohort reference';
  return `Historically ${f < 1 ? 'faster' : 'slower'} relative to the analysed course cohort`;
}

/** Compact form for dense cards and tables. */
export function factorPhraseShort(f: number | null | undefined): string {
  if (f == null) return LIMITED_MATCHED;
  if (Math.abs(f - 1) < 0.0025) return 'near cohort reference';
  return `historically ${f < 1 ? 'faster' : 'slower'} vs analysed cohort`;
}

export const RAW_FALLBACK_LABEL = 'Raw time comparison — course adjustment unavailable';

/** Signed seconds as "+1:12" / "−0:20" / "±0:00". */
export function formatDeltaSeconds(delta: number): string {
  const abs = Math.abs(delta);
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  return delta === 0 ? `±${text}` : `${delta > 0 ? '+' : '−'}${text}`;
}

export const PERFORMANCE_SOURCE_LABEL: Record<PerformanceSource, string> = {
  manual: 'Manual',
  csv: 'CSV import',
  parkrun_api: 'parkrun',
  garmin: 'Garmin',
  strava: 'Strava',
};
