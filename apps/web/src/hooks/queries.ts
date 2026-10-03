/** TanStack Query hooks: the only way pages obtain server data. */
import { useAuth } from '../auth/AuthProvider';
import type { AuthTicket } from '../auth/epoch';
import { personalKey } from '../auth/cache';
import type { PerformanceInput, HiddenGemModeId, HistoryWindowId, PbFinderSortId, PlacementTargetId, PlannerFilters } from '@runsaturday/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PlacementBasis, type PlacementQuery } from '../api/endpoints';
import { serializePlannerParams, type PlannerSelection } from '../lib/plannerParams';

export const queryKeys = {
  events: ['events'] as const,
  search: (q: string) => ['events', 'search', q] as const,
  nearby: (limit: number) => ['events', 'nearby', limit] as const,
  event: (id: string) => ['event', id] as const,
  eventHistory: (id: string, window: HistoryWindowId) => ['event', id, 'history', window] as const,
  saturday: (selection: PlannerSelection) => ['saturday', serializePlannerParams(selection).toString()] as const,
  profile: ['profile'] as const,
};

export const useEvents = () => useQuery({ queryKey: personalKey(useAuth().user!.id, queryKeys.events), queryFn: ({ signal }) => api.events(signal) });

export const useEventSearch = (q: string) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, queryKeys.search(q)),
    queryFn: ({ signal }) => api.searchEvents(q, signal),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });

export const useNearbyEvents = (limit = 5) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, queryKeys.nearby(limit)), queryFn: ({ signal }) => api.nearbyEvents(limit, signal) });

export const useEvent = (id: string) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, queryKeys.event(id)), queryFn: ({ signal }) => api.event(id, signal) });

export const useEventHistory = (id: string, window: HistoryWindowId) =>
  useQuery({
    queryKey: queryKeys.eventHistory(id, window),
    queryFn: ({ signal }) => api.eventHistory(id, window, signal),
    // Keep the previous window visible while switching windows, but never show another event's data.
    placeholderData: (previous) => (previous?.eventId === id ? previous : undefined),
  });

/**
 * The orchestrated Saturday answer for an intent. Home and the Saturday Planner both use this
 * one hook (and one server endpoint), so they can never rank differently.
 */
export const useSaturday = (selection: PlannerSelection) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, queryKeys.saturday(selection)),
    queryFn: ({ signal }) => api.saturday(selection, signal),
    placeholderData: keepPreviousData,
  });

export const useEventAnalytics = (id: string, window: HistoryWindowId, enabled = true) =>
  useQuery({
    queryKey: ['event', id, 'analytics', window] as const,
    queryFn: ({ signal }) => api.eventAnalytics(id, window, signal),
    enabled,
    placeholderData: (previous) => (previous?.eventId === id ? previous : undefined),
  });

export const usePlacement = (q: Omit<PlacementQuery, 'timeSeconds'> & { timeSeconds: number | null }) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, ['placement', q]),
    queryFn: ({ signal }) => api.placement({ ...q, timeSeconds: q.timeSeconds! }, signal),
    enabled: q.timeSeconds != null,
    placeholderData: keepPreviousData,
  });

/**
 * basis "current_form": the server converts the user's Current Form to this course. Otherwise
 * `source` is where the time was achieved; the API course-adjusts it when the data allow.
 */
export const useEventPlacement = (id: string, q: { timeSeconds?: number | null; source?: string; basis?: PlacementBasis } | null) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, ['event', id, 'placement', q]),
    queryFn: ({ signal }) => api.eventPlacement(id, { timeSeconds: q!.timeSeconds ?? undefined, source: q!.source, basis: q!.basis }, signal),
    enabled: q != null && (q.basis === 'current_form' || q.timeSeconds != null),
  });

export const useCurrentForm = () => useQuery({ queryKey: personalKey(useAuth().user!.id, ['current-form']), queryFn: ({ signal }) => api.currentForm(signal) });

export const usePbFinder = (q: { maxTravel?: number; sort: PbFinderSortId } & Pick<PlannerFilters, 'surface' | 'elevation' | 'confidence' | 'visited'>) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, ['pb-finder', q]), queryFn: ({ signal }) => api.pbFinder(q, signal), placeholderData: keepPreviousData });

export const useHiddenGems = (q: { mode: HiddenGemModeId; maxTravel?: number }) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, ['hidden-gems', q]), queryFn: ({ signal }) => api.hiddenGems(q, signal), placeholderData: keepPreviousData });

export const useCompare = (q: { ids: string[]; timeSeconds?: number; source?: string; basis?: PlacementBasis }) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, ['compare', q]),
    queryFn: ({ signal }) => api.compare(q, signal),
    enabled: q.ids.length >= 2,
    placeholderData: keepPreviousData,
  });

export const useProfile = () => useQuery({ queryKey: personalKey(useAuth().user!.id, queryKeys.profile), queryFn: ({ signal }) => api.profile(signal) });

// Personal performances (Phase 4A). Derived values (PBs, visits, presets) come from the server.

export const usePerformances = (q: { eventId?: string; limit?: number } = {}) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, ['performances', q]), queryFn: ({ signal }) => api.performances(q, signal) });

export const usePerformance = (id: string | undefined) =>
  useQuery({ queryKey: personalKey(useAuth().user!.id, ['performances', 'one', id]), queryFn: ({ signal }) => api.performance(id!, signal), enabled: id != null });

export const usePerformanceSummary = () => useQuery({ queryKey: personalKey(useAuth().user!.id, ['performance-summary']), queryFn: ({ signal }) => api.performanceSummary(signal) });

/**
 * A performance change can move PBs, recent best, visits and every tool that uses them, so all
 * cached server data is invalidated afterwards.
 */
function usePerformanceMutation<V>(fn: (variables: V, signal: AbortSignal) => Promise<unknown>) {
  const client = useQueryClient();
  const auth = useAuth();
  const mutation = useMutation({
    mutationFn: async ({ variables, ticket }: { variables: V; ticket: AuthTicket }) => {
      ticket.signal.throwIfAborted();
      const result = await fn(variables, ticket.signal);
      ticket.signal.throwIfAborted();
      return result;
    },
    onSuccess: (_, { ticket }) => { if (ticket.isCurrent()) return client.invalidateQueries(); },
  });
  return { ...mutation, mutateAsync: (variables: V) => mutation.mutateAsync({ variables, ticket: auth.captureOperation() }) };
}

/** Explore & Challenges (Phase 5A): all derived on the server from performances. */
export const useExploreSummary = () => useQuery({ queryKey: personalKey(useAuth().user!.id, ['explore-summary']), queryFn: ({ signal }) => api.exploreSummary(signal) });
export const useChallenges = () => useQuery({ queryKey: personalKey(useAuth().user!.id, ['challenges']), queryFn: ({ signal }) => api.challenges(signal) });
export const useChallenge = (id: string) => useQuery({ queryKey: personalKey(useAuth().user!.id, ['challenges', id]), queryFn: ({ signal }) => api.challenge(id, signal) });
/** Events that would complete one challenge item (Explore's challenge filter); disabled without one. */
export const useChallengeOpportunities = (filter: { challenge: string; item: string } | null) =>
  useQuery({
    queryKey: personalKey(useAuth().user!.id, ['challenges', filter?.challenge, 'opportunities', filter?.item]),
    queryFn: ({ signal }) => api.challengeOpportunities(filter!.challenge, filter!.item, signal),
    enabled: filter != null,
  });
export const useEventVisits = (id: string) => useQuery({ queryKey: personalKey(useAuth().user!.id, ['event', id, 'visits']), queryFn: ({ signal }) => api.eventVisits(id, signal) });

export const useSavePerformance = (id?: string) =>
  usePerformanceMutation((input: PerformanceInput, signal) => (id ? api.updatePerformance(id, input, signal) : api.createPerformance(input, signal)));

export const useDeletePerformance = () => usePerformanceMutation((id: string, signal) => api.deletePerformance(id, signal));
