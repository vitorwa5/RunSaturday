import type {
  BestPickResponse,
  CompareResponse,
  EventAnalyticsResponse,
  EventPlacement,
  HiddenGemModeId,
  HiddenGemsResponse,
  PbFinderResponse,
  PbFinderSortId,
  PlacementMode,
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
  RunnerForm,
  PerformanceInput,
  PerformanceSummary,
  UserPerformance,
  UserPerformancesResponse,
} from '@runsaturday/shared';
import { plannerApiQuery, type PlannerSelection } from '../lib/plannerParams';
import { apiGet, apiSend } from './client';

/** "current_form": the server uses the user's own Current Form (course-adjusted reference) instead of a time. */
export type PlacementBasis = 'time' | 'current_form';

export interface PlacementQuery {
  timeSeconds: number;
  basis?: PlacementBasis;
  window: HistoryWindowId;
  target: PlacementTargetId;
  maxTravel?: number;
  /** Omitted = auto (course adjusted when a source event with reliable data is given). */
  mode?: PlacementMode;
  source?: string;
}

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
  performances: (q: { eventId?: string; limit?: number }, signal?: AbortSignal) => apiGet<UserPerformancesResponse>('/profile/performances', q, signal),
  performance: (id: string, signal?: AbortSignal) => apiGet<UserPerformance>(`/profile/performances/${encodeURIComponent(id)}`, {}, signal),
  performanceSummary: (signal?: AbortSignal) => apiGet<PerformanceSummary>('/profile/performance-summary', {}, signal),
  createPerformance: (input: PerformanceInput) => apiSend<UserPerformance>('POST', '/profile/performances', input),
  updatePerformance: (id: string, input: PerformanceInput) => apiSend<UserPerformance>('PATCH', `/profile/performances/${encodeURIComponent(id)}`, input),
  deletePerformance: (id: string) => apiSend<null>('DELETE', `/profile/performances/${encodeURIComponent(id)}`),
  eventAnalytics: (id: string, window: HistoryWindowId, signal?: AbortSignal) =>
    apiGet<EventAnalyticsResponse>(`/events/${encodeURIComponent(id)}/analytics`, { window }, signal),
  placement: (q: PlacementQuery, signal?: AbortSignal) =>
    apiGet<PlacementResponse>(
      '/placement',
      q.basis === 'current_form'
        ? { basis: 'current_form', window: q.window, target: q.target, maxTravel: q.maxTravel, mode: q.mode }
        : { time: q.timeSeconds, window: q.window, target: q.target, maxTravel: q.maxTravel, mode: q.mode, source: q.source },
      signal,
    ),
  eventPlacement: (id: string, q: { timeSeconds?: number; source?: string; basis?: PlacementBasis }, signal?: AbortSignal) =>
    apiGet<EventPlacement>(
      `/events/${encodeURIComponent(id)}/placement`,
      q.basis === 'current_form' ? { basis: 'current_form' } : { time: q.timeSeconds, source: q.source },
      signal,
    ),
  pbFinder: (
    q: { maxTravel?: number; sort: PbFinderSortId } & Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>,
    signal?: AbortSignal,
  ) => apiGet<PbFinderResponse>('/pb-finder', q, signal),
  hiddenGems: (q: { mode: HiddenGemModeId; maxTravel?: number }, signal?: AbortSignal) => apiGet<HiddenGemsResponse>('/hidden-gems', q, signal),
  compare: (q: { ids: string[]; timeSeconds?: number; source?: string; basis?: PlacementBasis }, signal?: AbortSignal) =>
    apiGet<CompareResponse>(
      '/compare',
      q.basis === 'current_form'
        ? { ids: q.ids.join(','), basis: 'current_form' }
        : { ids: q.ids.join(','), time: q.timeSeconds, source: q.timeSeconds != null ? q.source : undefined },
      signal,
    ),
  currentForm: (signal?: AbortSignal) => apiGet<RunnerForm>('/profile/current-form', {}, signal),
};
