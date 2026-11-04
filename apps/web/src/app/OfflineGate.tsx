import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';

/** Only the provider's current authoritative session may reveal account UI. */
export function OfflineGate({ children }: { children: ReactNode }) {
  const { online, ready, error, refresh } = useAuth();
  if (online && ready) return children;
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <p className="font-semibold text-brand-700">5K Compass</p>
      <h1 className="text-2xl font-bold">{!online ? 'You’re offline' : error ? 'Session check unavailable' : 'Checking your session…'}</h1>
      <p role="status" className="text-sm text-muted">
        {!online
          ? 'Connect to the internet to continue. We’ll check your session when you reconnect. Your private history is not available offline.'
          : error ?? 'Checking your session before continuing…'}
      </p>
      {online && error && <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-xl bg-brand-700 px-4 font-semibold text-white">Try again</button>}
    </main>
  );
}
