import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Event data changes at most a few times a week; avoid refetch storms.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Don't retry client errors (4xx); retry transient failures twice.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});
