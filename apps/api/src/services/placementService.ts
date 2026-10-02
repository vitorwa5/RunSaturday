/** Where Could I Place? Orchestrates the data layer and the pure placement engine. */
import type { CourseAdjustment, FormReference, EventPlacement, EventSummary, HistoryWindowId, PlacementTargetId } from '@runsaturday/shared';
import type { CourseFactorResult } from '../analytics/courseSpeed';
import { assessConfidence, STABILITY_SCALES } from '../domain/confidence';
import { historicalPlacements, summarizePlacements, targetFrequency, type PlacementOccurrenceInput } from '../domain/placementEngine';
import { windowFrom } from '../domain/windows';
import type { DataStore } from '../repositories/DataStore';
import { adjustFromForm, adjustPerformance, type AdjustmentSource } from './courseAdjustment';

const HISTORY_SHOWN = 12;

/** Build one event's placement summary from its occurrence inputs (pure). */
export function buildEventPlacement(
  event: EventSummary,
  inputs: readonly PlacementOccurrenceInput[],
  target: PlacementTargetId,
  asOfDate: string,
  analysed: { seconds: number; adjustment: CourseAdjustment | null },
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
    analysedSeconds: analysed.seconds,
    adjustment: analysed.adjustment,
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

function groupByEvent(inputs: readonly PlacementOccurrenceInput[]) {
  const byEvent = new Map<string, PlacementOccurrenceInput[]>();
  for (const input of inputs) {
    const list = byEvent.get(input.eventId) ?? [];
    list.push(input);
    byEvent.set(input.eventId, list);
  }
  return byEvent;
}

interface PlacementOptions {
  window: HistoryWindowId;
  target: PlacementTargetId;
  today: string;
}

/** Raw mode: the exact same time analysed at every event. */
export async function computePlacements(
  store: DataStore,
  events: EventSummary[],
  options: PlacementOptions & { timeSeconds: number },
): Promise<{ placements: EventPlacement[]; from: string | null }> {
  const from = windowFrom(options.window, options.today);
  const inputs = await store.listPlacementInputs(
    options.timeSeconds,
    events.map((e) => e.id),
    from,
    options.today,
  );
  const byEvent = groupByEvent(inputs);
  return {
    placements: events.map((e) =>
      buildEventPlacement(e, byEvent.get(e.id) ?? [], options.target, options.today, { seconds: options.timeSeconds, adjustment: null }),
    ),
    from,
  };
}

/**
 * Course-adjusted mode: the source performance is converted to each event's equivalent time
 * (Course Speed Factor V1), and that equivalent goes through the unchanged placement engine.
 * Events whose factors are not reliable are returned in `unavailable`, never placed with an
 * unadjusted time.
 */
export async function computeAdjustedPlacements(
  store: DataStore,
  events: EventSummary[],
  options: PlacementOptions & { factors: ReadonlyMap<string, CourseFactorResult> } & ({ source: AdjustmentSource } | { form: FormReference }),
): Promise<{ placements: EventPlacement[]; unavailable: CourseAdjustment[]; from: string | null }> {
  const from = windowFrom(options.window, options.today);
  // A recorded performance converts via its source event's factor; Current Form is already neutral.
  const adjust = (eventId: string) =>
    'form' in options
      ? adjustFromForm(options.form, { eventId }, options.factors.get(eventId))
      : adjustPerformance(options.source, options.factors.get(options.source.eventId), { eventId }, options.factors.get(eventId));
  const adjustments = events.map((e) => ({ event: e, adjustment: adjust(e.id) }));

  // One data query per distinct equivalent time (events often share one).
  const bySeconds = new Map<number, string[]>();
  for (const { event, adjustment } of adjustments) {
    if (adjustment.equivalentSeconds == null) continue;
    bySeconds.set(adjustment.equivalentSeconds, [...(bySeconds.get(adjustment.equivalentSeconds) ?? []), event.id]);
  }
  const byEvent = new Map<string, PlacementOccurrenceInput[]>();
  for (const [seconds, ids] of bySeconds) {
    for (const [id, list] of groupByEvent(await store.listPlacementInputs(seconds, ids, from, options.today))) byEvent.set(id, list);
  }

  const placements: EventPlacement[] = [];
  const unavailable: CourseAdjustment[] = [];
  for (const { event, adjustment } of adjustments) {
    if (adjustment.equivalentSeconds == null) {
      unavailable.push(adjustment);
      continue;
    }
    placements.push(
      buildEventPlacement(event, byEvent.get(event.id) ?? [], options.target, options.today, { seconds: adjustment.equivalentSeconds, adjustment }),
    );
  }
  return { placements, unavailable, from };
}
