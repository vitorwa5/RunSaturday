import type { BestPickResponse, EventDetail, EventSummary, Goal, UserProfile } from '@runsaturday/shared';
import { apiGet } from './client';

export const api = {
  events: (signal?: AbortSignal) => apiGet<EventSummary[]>('/events', {}, signal),
  searchEvents: (q: string, signal?: AbortSignal) => apiGet<EventSummary[]>('/events/search', { q }, signal),
  nearbyEvents: (limit: number, signal?: AbortSignal) => apiGet<EventSummary[]>('/events/nearby', { limit }, signal),
  event: (id: string, signal?: AbortSignal) => apiGet<EventDetail>(`/events/${encodeURIComponent(id)}`, {}, signal),
  bestPick: (goal: Goal, signal?: AbortSignal) => apiGet<BestPickResponse>('/recommendations/best-pick', { goal }, signal),
  profile: (signal?: AbortSignal) => apiGet<UserProfile>('/profile', {}, signal),
};
