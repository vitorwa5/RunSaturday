import type { QueryClient, QueryKey } from '@tanstack/react-query';
export const personalKey = (userId: string, key: QueryKey) => ['personal', userId, ...key] as const;
/** Remove immediately, then cancel in-flight requests: responses cannot become another account's cache. */
export function clearPersonalData(client: QueryClient) {
  const filter = { predicate: (query: { queryKey: QueryKey }) => query.queryKey[0] === 'personal' };
  client.removeQueries(filter);
  client.getMutationCache().clear();
  return client.cancelQueries(filter);
}
