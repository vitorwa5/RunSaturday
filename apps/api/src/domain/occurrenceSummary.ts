/**
 * Derives EventOccurrence summary columns from Result rows.
 *
 * Result rows are the canonical source of truth for positions and finish times. The
 * occurrence columns (participantCount, winner/3rd/5th/10th times) are only a cache for
 * fast listing, and this function is the one place that computes them. Anything that writes
 * Results (seed today, ingestion later) must write this summary in the same operation, and
 * must never set those columns from any other source.
 */

export interface ResultLike {
  position: number;
  finishTimeSeconds: number;
}

export interface OccurrenceSummary {
  participantCount: number | null;
  winnerTimeSeconds: number | null;
  thirdTimeSeconds: number | null;
  fifthTimeSeconds: number | null;
  tenthTimeSeconds: number | null;
}

/** Positions whose finish times are cached on EventOccurrence. */
export const SUMMARY_POSITIONS = { winnerTimeSeconds: 1, thirdTimeSeconds: 3, fifthTimeSeconds: 5, tenthTimeSeconds: 10 } as const;

/** Summary for the given results. With no results (e.g. cancelled) every field is null. */
export function summarizeResults(results: readonly ResultLike[]): OccurrenceSummary {
  if (results.length === 0) {
    return { participantCount: null, winnerTimeSeconds: null, thirdTimeSeconds: null, fifthTimeSeconds: null, tenthTimeSeconds: null };
  }
  // Look up by position, not array index, so input order does not matter.
  const timeAt = new Map(results.map((r) => [r.position, r.finishTimeSeconds]));
  const at = (position: number) => timeAt.get(position) ?? null;
  return {
    participantCount: results.length,
    winnerTimeSeconds: at(SUMMARY_POSITIONS.winnerTimeSeconds),
    thirdTimeSeconds: at(SUMMARY_POSITIONS.thirdTimeSeconds),
    fifthTimeSeconds: at(SUMMARY_POSITIONS.fifthTimeSeconds),
    tenthTimeSeconds: at(SUMMARY_POSITIONS.tenthTimeSeconds),
  };
}
