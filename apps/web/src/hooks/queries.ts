/** TanStack Query hooks: the only way pages obtain server data. */
import type { Goal, HiddenGemModeId, HistoryWindowId, PbFinderSortId, PlacementTargetId, PlannerFilters } from '@runsaturday/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { serializePlannerParams, type PlannerSelection } from '../lib/plannerParams';

export const queryKeys = {
  events: ['events'] as const,
  search: (q: string) => ['events', 'search', q] as const,
  nearby: (limit: number) => ['events', 'nearby', limit] as const,
  event: (id: string) => ['event', id] as const,
  eventHistory: (id: string, window: HistoryWindowId) => ['event', id, 'history', window] as const,
  planner: (selection: PlannerSelection) => ['planner', serializePlannerParams(selection).toString()] as const,
  bestPick: (goal: Goal) => ['best-pick', goal] as const,
  profile: ['profile'] as const,
};

export const useEvents = () => useQuery({ queryKey: queryKeys.events, queryFn: ({ signal }) => api.events(signal) });

export const useEventSearch = (q: string) =>
  useQuery({
    queryKey: queryKeys.search(q),
    queryFn: ({ signal }) => api.searchEvents(q, signal),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });

export const useNearbyEvents = (limit = 5) =>
  useQuery({ queryKey: queryKeys.nearby(limit), queryFn: ({ signal }) => api.nearbyEvents(limit, signal) });

export const useEvent = (id: string) =>
  useQuery({ queryKey: queryKeys.event(id), queryFn: ({ signal }) => api.event(id, signal) });

export const useEventHistory = (id: string, window: HistoryWindowId) =>
  useQuery({
    queryKey: queryKeys.eventHistory(id, window),
    queryFn: ({ signal }) => api.eventHistory(id, window, signal),
    // Keep the previous window visible while switching windows, but never show another event's data.
    placeholderData: (previous) => (previous?.eventId === id ? previous : undefined),
  });

export const usePlanner = (selection: PlannerSelection) =>
  useQuery({
    queryKey: queryKeys.planner(selection),
    queryFn: ({ signal }) => api.planner(selection, signal),
    placeholderData: keepPreviousData,
  });

export const useEventAnalytics = (id: string, window: HistoryWindowId, enabled = true) =>
  useQuery({
    queryKey: ['event', id, 'analytics', window] as const,
    queryFn: ({ signal }) => api.eventAnalytics(id, window, signal),
    enabled,
    placeholderData: (previous) => (previous?.eventId === id ? previous : undefined),
  });

export const usePlacement = (q: { timeSeconds: number | null; window: HistoryWindowId; target: PlacementTargetId; maxTravel?: number }) =>
  useQuery({
    queryKey: ['placement', q] as const,
    queryFn: ({ signal }) => api.placement({ ...q, timeSeconds: q.timeSeconds! }, signal),
    enabled: q.timeSeconds != null,
    placeholderData: keepPreviousData,
  });

export const useEventPlacement = (id: string, timeSeconds: number | null | undefined) =>
  useQuery({
    queryKey: ['event', id, 'placement', timeSeconds] as const,
    queryFn: ({ signal }) => api.eventPlacement(id, timeSeconds!, signal),
    enabled: timeSeconds != null,
  });

export const usePbFinder = (q: { maxTravel?: number; sort: PbFinderSortId } & Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>) =>
  useQuery({ queryKey: ['pb-finder', q] as const, queryFn: ({ signal }) => api.pbFinder(q, signal), placeholderData: keepPreviousData });

export const useHiddenGems = (q: { mode: HiddenGemModeId; maxTravel?: number }) =>
  useQuery({ queryKey: ['hidden-gems', q] as const, queryFn: ({ signal }) => api.hiddenGems(q, signal), placeholderData: keepPreviousData });

export const useCompare = (q: { ids: string[]; timeSeconds?: number }) =>
  useQuery({
    queryKey: ['compare', q] as const,
    queryFn: ({ signal }) => api.compare(q, signal),
    enabled: q.ids.length >= 2,
    placeholderData: keepPreviousData,
  });

export const useBestPick = (goal: Goal) =>
  useQuery({
    queryKey: queryKeys.bestPick(goal),
    queryFn: ({ signal }) => api.bestPick(goal, signal),
    placeholderData: keepPreviousData,
  });

export const useProfile = () => useQuery({ queryKey: queryKeys.profile, queryFn: ({ signal }) => api.profile(signal) });
