/** Where Could I Place? Orchestrates the data layer and the pure placement engine. */
import type { EventPlacement, EventSummary, HistoryWindowId, PlacementTargetId } from '@runsaturday/shared';
import { assessConfidence, STABILITY_SCALES } from '../domain/confidence';
import { historicalPlacements, summarizePlacements, targetFrequency, type PlacementOccurrenceInput } from '../domain/placementEngine';
import { windowFrom } from '../domain/windows';
import type { DataStore } from '../repositories/DataStore';

const HISTORY_SHOWN = 12;

/** Build one event's placement summary from its occurrence inputs (pure). */
export function buildEventPlacement(
  event: EventSummary,
  inputs: readonly PlacementOccurrenceInput[],
  target: PlacementTargetId,
  asOfDate: string,
): EventPlacement {
  const { placements, excluded } = historicalPlacements(inputs);
  const stats = summarizePlacements(placements);
  // Confidence V2 on the placement data: amount, recency, completeness, stability of placings.
  const confidence = assessConfidence({
    observations: placements.map((p) => ({ date: p.date, value: p.best })),
    eligibleCount: inputs.filter((o) => o.status !== 'cancelled').length,
    asOfDate,
    stability: STABILITY_SCALES.placings,
  });
  return {
    event,
    sampleSize: placements.length,
    confidence: confidence.level,
    stats,
    target: stats ? targetFrequency(placements, target) : null,
    excluded,
    history: placements.slice(0, HISTORY_SHOWN),
  };
}

/**
 * Rank events by how often the target was reached historically (share of events), then by
 * median placement. Events with too little data never outrank events with enough; events with
 * no usable data are dropped (and counted by the caller).
 */
export function rankPlacements(placements: EventPlacement[]): EventPlacement[] {
  const share = (p: EventPlacement) => (p.target && p.target.of > 0 ? p.target.count / p.target.of : 0);
  return placements
    .filter((p) => p.stats != null)
    .sort(
      (a, b) =>
        Number(a.confidence === 'insufficient') - Number(b.confidence === 'insufficient') ||
        share(b) - share(a) ||
        // Conservative end of the median range.
        a.stats!.medianPlacement.high - b.stats!.medianPlacement.high ||
        a.event.name.localeCompare(b.event.name),
    );
}

export async function computePlacements(
  store: DataStore,
  events: EventSummary[],
  options: { timeSeconds: number; window: HistoryWindowId; target: PlacementTargetId; today: string },
): Promise<{ placements: EventPlacement[]; from: string | null }> {
  const from = windowFrom(options.window, options.today);
  const inputs = await store.listPlacementInputs(
    options.timeSeconds,
    events.map((e) => e.id),
    from,
    options.today,
  );
  const byEvent = new Map<string, PlacementOccurrenceInput[]>();
  for (const input of inputs) {
    const list = byEvent.get(input.eventId) ?? [];
    list.push(input);
    byEvent.set(input.eventId, list);
  }
  return { placements: events.map((e) => buildEventPlacement(e, byEvent.get(e.id) ?? [], options.target, options.today)), from };
}
