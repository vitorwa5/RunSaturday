import type {
  BestPickResponse,
  CompareResponse,
  EventPlacement,
  HiddenGemModeId,
  HiddenGemsResponse,
  PbFinderResponse,
  PbFinderSortId,
  PlacementResponse,
  PlacementTargetId,
  PlannerFilters,
  EventDetail,
  EventHistoryResponse,
  EventSummary,
  Goal,
  HistoryWindowId,
  PlannerResponse,
  UserProfile,
} from '@runsaturday/shared';
import { plannerApiQuery, type PlannerSelection } from '../lib/plannerParams';
import { apiGet } from './client';

export const api = {
  events: (signal?: AbortSignal) => apiGet<EventSummary[]>('/events', {}, signal),
  searchEvents: (q: string, signal?: AbortSignal) => apiGet<EventSummary[]>('/events/search', { q }, signal),
  nearbyEvents: (limit: number, signal?: AbortSignal) => apiGet<EventSummary[]>('/events/nearby', { limit }, signal),
  event: (id: string, signal?: AbortSignal) => apiGet<EventDetail>(`/events/${encodeURIComponent(id)}`, {}, signal),
  eventHistory: (id: string, window: HistoryWindowId, signal?: AbortSignal) =>
    apiGet<EventHistoryResponse>(`/events/${encodeURIComponent(id)}/history`, { window }, signal),
  bestPick: (goal: Goal, signal?: AbortSignal) => apiGet<BestPickResponse>('/recommendations/best-pick', { goal }, signal),
  planner: (selection: PlannerSelection, signal?: AbortSignal) =>
    apiGet<PlannerResponse>('/planner', plannerApiQuery(selection), signal),
  profile: (signal?: AbortSignal) => apiGet<UserProfile>('/profile', {}, signal),
  placement: (q: { timeSeconds: number; window: HistoryWindowId; target: PlacementTargetId; maxTravel?: number }, signal?: AbortSignal) =>
    apiGet<PlacementResponse>('/placement', { time: q.timeSeconds, window: q.window, target: q.target, maxTravel: q.maxTravel }, signal),
  eventPlacement: (id: string, timeSeconds: number, signal?: AbortSignal) =>
    apiGet<EventPlacement>(`/events/${encodeURIComponent(id)}/placement`, { time: timeSeconds }, signal),
  pbFinder: (
    q: { maxTravel?: number; sort: PbFinderSortId } & Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>,
    signal?: AbortSignal,
  ) => apiGet<PbFinderResponse>('/pb-finder', q, signal),
  hiddenGems: (q: { mode: HiddenGemModeId; maxTravel?: number }, signal?: AbortSignal) => apiGet<HiddenGemsResponse>('/hidden-gems', q, signal),
  compare: (q: { ids: string[]; timeSeconds?: number }, signal?: AbortSignal) =>
    apiGet<CompareResponse>('/compare', { ids: q.ids.join(','), time: q.timeSeconds }, signal),
};
