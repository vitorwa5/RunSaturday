/**
 * Thin fetch wrapper for the RunSaturday API. All network access from the web app goes
 * through here; components never call fetch directly.
 */
import type { ApiErrorBody } from '@runsaturday/shared';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

/** Error carrying a message that is safe to show to users. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | boolean | null | undefined;

export async function apiGet<T>(path: string, query: Record<string, QueryValue> = {}, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.size > 0 ? `?${params}` : '';

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}${qs}`, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'We could not reach 5K Compass. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? 'unknown_error',
      body?.error.message ?? 'Something went wrong. Please try again.',
    );
  }
  return (await response.json()) as T;
}
