/**
 * Presentation mappings: how values are labelled and toned in the UI.
 * No scoring maths lives here, only display thresholds and wording.
 */
import type { ConfidenceLevel, CourseType, FacilityStatus, Surface } from '@runsaturday/shared';

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
  if (score == null) return { label: 'No score', tone: 'neutral' };
  if (score >= 70) return { label: 'High', tone: 'info' };
  if (score >= 45) return { label: 'Medium', tone: 'info' };
  return { label: 'Lower', tone: 'info' };
}

/** Difficulty on the 1–10 scale (higher = harder). */
export function difficultyBand(score: number | null | undefined): Band {
  if (score == null) return { label: 'No score', tone: 'neutral' };
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
