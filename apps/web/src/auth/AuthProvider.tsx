import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../api/client';
import { clearPersonalData } from './cache';

interface SessionState { mode: 'demo' | 'beta'; user: { id: string; email: string | null } | null; expiresAt?: string }
interface AuthState extends SessionState { ready: boolean; error: string | null; refresh(notify?: boolean): Promise<void>; logout(): Promise<void>; deleteAccount(): Promise<void> }
const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<SessionState & { ready: boolean; error: string | null }>({ mode: 'beta', user: null, ready: false, error: null });
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const hide = useCallback(() => {
    generation.current++;
    setState((s) => ({ ...s, ready: false, user: null, error: null }));
    void clearPersonalData(client);
  }, [client]);
  const refresh = useCallback(async (notify = false) => {
    hide();
    const current = generation.current;
    try {
      const session = await apiGet<SessionState>('/account/session');
      if (current === generation.current) {
        setState({ ...session, ready: true, error: null });
        if (notify) channel.current?.postMessage('session-changed');
      }
    } catch {
      if (current === generation.current) setState((s) => ({ ...s, ready: true, user: null, error: 'We could not check your session. Please try again.' }));
    }
  }, [hide]);
  const endSession = useCallback(async (deleting: boolean) => {
    hide();
    try {
      if (deleting) await apiSend('DELETE', '/account', { confirmation: 'DELETE MY ACCOUNT' });
      else await apiSend('POST', '/auth/sign-out', {});
      setState({ mode: 'beta', user: null, ready: true, error: null });
      channel.current?.postMessage('session-changed');
    } catch (error) {
      setState({ mode: 'beta', user: null, ready: true, error: error instanceof Error ? error.message : 'Please try again.' });
      throw error;
    }
  }, [hide]);
  useEffect(() => {
    void refresh();
    const onExpiry = () => {
      hide();
      setState({ mode: 'beta', user: null, ready: true, error: null });
      channel.current?.postMessage('session-changed');
    };
    const onFocus = () => { void refresh(); };
    channel.current = new BroadcastChannel('5k-compass-session');
    channel.current.onmessage = onFocus;
    window.addEventListener('compass-session-expired', onExpiry);
    window.addEventListener('focus', onFocus);
    return () => {
      channel.current?.close();
      window.removeEventListener('compass-session-expired', onExpiry);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, hide]);
  useEffect(() => {
    if (!state.expiresAt || !state.user) return;
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('compass-session-expired')), Math.max(0, Date.parse(state.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.expiresAt, state.user]);
  return <AuthContext value={{ ...state, refresh, logout: () => endSession(false), deleteAccount: () => endSession(true) }}>{children}</AuthContext>;
}
