/**
 * Explore & Challenges (Phase 5A): the exploration side of "My 5K". Everything is derived from
 * the user's performances (challenges/visits.ts) and the active event dataset; no Result rows
 * are read, and nothing is stored.
 */
import type { ChallengeResult, EventVisitSummary, ExploreSummary } from '@runsaturday/shared';
import { evaluateChallenges, helpsWith } from '../challenges/engine';
import type { ChallengeContext } from '../challenges/types';
import type { VisitHistory } from '../challenges/visits';
import { scopedVisitHistory } from './personalVisits';
import type { DataStore } from '../repositories/DataStore';

export interface ExploreState {
  history: VisitHistory;
  context: ChallengeContext;
  challenges: ChallengeResult[];
}

/** Resolves trusted historical visits and evaluates challenges against active candidates. */
export async function loadExploreState(store: DataStore, userId: string, today: string): Promise<ExploreState> {
  const [performances, events] = await Promise.all([store.listUserPerformances(userId), store.listActiveEvents()]);
  const history = await scopedVisitHistory(store, performances, today);
  const context: ChallengeContext = { asOfDate: today, visited: history.events, events };
  return { history, context, challenges: evaluateChallenges(context) };
}

export function exploreSummary({ history, context, challenges }: ExploreState): ExploreSummary {
  const ref = (v: { eventId: string; eventName: string; date: string } | undefined) => v ?? null;
  const first = history.visits[0];
  const latest = history.visits.at(-1);
  const most = [...history.events].sort((a, b) => b.visitCount - a.visitCount || a.eventName.localeCompare(b.eventName) || a.eventId.localeCompare(b.eventId))[0];
  return {
    asOfDate: history.asOfDate,
    eventsVisited: history.events.length,
    totalRuns: history.totalRuns,
    externalRuns: history.externalRuns,
    repeatVisits: history.visits.length - history.events.length,
    firstVisit: ref(first && { eventId: first.eventId, eventName: first.eventName, date: first.date }),
    latestVisit: ref(latest && { eventId: latest.eventId, eventName: latest.eventName, date: latest.date }),
    mostVisited: most ? { eventId: most.eventId, eventName: most.eventName, visitCount: most.visitCount } : null,
    eventsInDataset: context.events.length,
    challengesCompleted: challenges.filter((c) => c.status === 'completed').length,
    challenges: challenges.map((c) => ({ id: c.id, name: c.name, status: c.status, progress: c.progress })),
    visitedEvents: history.events,
  };
}

export function eventVisitSummary(state: ExploreState, event: { id: string; name: string; town: string | null; region: string | null }): EventVisitSummary {
  const visited = state.history.events.find((e) => e.eventId === event.id);
  return {
    eventId: event.id,
    visited: visited != null,
    visitCount: visited?.visitCount ?? 0,
    firstVisit: visited?.firstVisit ?? null,
    latestVisit: visited?.latestVisit ?? null,
    pbSeconds: visited?.pbSeconds ?? null,
    helpsWith: helpsWith(event, state.challenges),
  };
}
