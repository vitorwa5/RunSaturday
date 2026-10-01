import type {
  BestPickResponse,
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
};
