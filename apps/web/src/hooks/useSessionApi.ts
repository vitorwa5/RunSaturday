import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { captureHistorySession, withHistorySession } from '../auth/historyOperation';
import { createApi } from '../api/endpoints';
import type { AuthTicket } from '../auth/epoch';

export function createSessionApi(session: Parameters<typeof captureHistorySession>[0], captureOperation: () => AuthTicket) {
  const origin = captureHistorySession(session);
  const bound = createApi(origin.sessionBinding);
  return Object.fromEntries(Object.entries(bound).map(([name, operation]) => {
    // H1 already holds this same non-reentrant lock through its history response.
    if (['previewHistory', 'commitHistory', 'deleteCsvHistory'].includes(name)) return [name, operation];
    return [name, (...args: unknown[]) => {
      const ticket = captureOperation();
      const signals = args.filter((arg): arg is AbortSignal => arg instanceof AbortSignal);
      const signal = AbortSignal.any([ticket.signal, ...signals]);
      return withHistorySession(origin, { ...ticket, signal }, async () => {
        // Cancellation after dispatch must never release the cookie lock early.
        const result = await (operation as (...input: unknown[]) => Promise<unknown>)(...args.map(arg => arg instanceof AbortSignal ? undefined : arg));
        signal.throwIfAborted();
        return result;
      });
    }];
  })) as typeof bound;
}

/** Each closure retains its rendered origin, including while queued behind cookie writes. */
export function useSessionApi() {
  const auth = useAuth();
  return useMemo(() => createSessionApi(auth, auth.captureOperation),
    [auth.mode, auth.user?.id, auth.sessionBinding, auth.expiresAt, auth.captureOperation]);
}
