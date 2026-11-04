import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../api/client';
import { clearPersonalData } from './cache';
import { AuthEpoch, withAuthLock, type AuthTicket } from './epoch';

interface SessionState { mode: 'demo' | 'beta'; user: { id: string; email: string | null } | null; expiresAt?: string; sessionBinding?: string }
interface AuthState extends SessionState {
  ready: boolean; error: string | null; online: boolean;
  refresh(): Promise<void>; logout(): Promise<void>; deleteAccount(): Promise<void>;
  sendCode(email: string): Promise<boolean>; signIn(email: string, otp: string): Promise<void>;
  captureOperation(): AuthTicket;
}
const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<SessionState & { ready: boolean; error: string | null }>({ mode: 'beta', user: null, ready: false, error: null });
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const connected = useRef(navigator.onLine !== false);
  // Expiry notifications are not authoritative reconnect/session-bootstrap checks.
  // Keep this barrier synchronous so a late unsignaled write cannot release it.
  const validationRequired = useRef(true);
  const epoch = useRef(new AuthEpoch()).current;
  // Keep the validated/anticipated session synchronously: React may batch renders across awaits.
  const sessionIntent = useRef<SessionState>({ mode: 'beta', user: null });
  const channel = useRef<BroadcastChannel | null>(null);
  const remoteTransitions = useRef(new Set<string>());
  const broadcast = useCallback((message: object) => {
    if (channel.current) channel.current.postMessage(message);
    else {
      // A cookie-changing request may finish after unmount; still release other tabs' barrier.
      const temporary = new BroadcastChannel('5k-compass-session');
      temporary.postMessage(message); temporary.close();
    }
  }, []);
  const reset = useCallback((preserveSignedOut = false) => {
    // Revalidating an already signed-out view must not destroy the email/OTP step
    // when the runner returns from their inbox. Signed-in personal UI still hides.
    setState((s) => ({ ...s, ready: preserveSignedOut && s.ready && !s.user, user: null, error: null }));
    void clearPersonalData(client);
  }, [client]);
  const applySession = (session: SessionState) => {
    validationRequired.current = false;
    if (session.user && session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
      sessionIntent.current = { mode: session.mode, user: null };
      setState({ mode: session.mode, user: null, ready: true, error: null });
    } else { sessionIntent.current = session; setState({ ...session, ready: true, error: null }); }
  };
  const refresh = useCallback(async () => {
    if (!epoch.mounted || !connected.current || epoch.busy || remoteTransitions.current.size) return;
    const ticket = epoch.advance(); reset(true);
    try {
      const session = await withAuthLock(() => {
        // A lock implementation may release an already cancelled waiter.
        if (!ticket.isCurrent() || !connected.current) throw new DOMException('Session check superseded', 'AbortError');
        return apiGet<SessionState>('/account/session', {}, ticket.signal);
      }, ticket.signal);
      if (ticket.isCurrent()) applySession(session);
    } catch (error) {
      if (ticket.isCurrent() && (error as Error).name !== 'AbortError') {
        // The displayed signed-out view must not retain authority from a failed refresh.
        validationRequired.current = true;
        sessionIntent.current = { mode: 'beta', user: null };
        setState({ mode: 'beta', user: null, ready: false, error: 'We could not check your session. Please try again.' });
      }
    }
  }, [epoch, reset]);
  const transition = useCallback((operation: 'logout' | 'delete' | 'login', origin: SessionState, input?: { email: string; otp: string }) => {
    let stale = false;
    const id = crypto.randomUUID();
    const intendedUserId = origin.user?.id ?? null;
    const intendedExpiry = origin.user ? origin.expiresAt : undefined;
    const intendedBinding = origin.sessionBinding ?? 'signed-out';
    const result = epoch.transition(async (ticket) => {
      try {
        await withAuthLock(async () => {
          const assertIntent = () => {
            if (!ticket.isCurrent()) throw new DOMException('Account operation superseded', 'AbortError');
          };
          // Waiting for the queue/lock must not retarget an old intention to the current cookie.
          assertIntent();
          const current = await apiGet<SessionState>('/account/session', {}, ticket.signal);
          assertIntent();
          if ((current.user?.id ?? null) !== intendedUserId || (intendedExpiry && current.expiresAt !== intendedExpiry) || (current.sessionBinding ?? 'signed-out') !== intendedBinding) {
            epoch.advance();
            throw new DOMException('Account session changed', 'AbortError');
          }
          // No await between this check and sending the cookie-mutating request.
          assertIntent();
          if (operation === 'login') {
            await apiSend('POST', '/auth/sign-in/email-otp', input, undefined, intendedBinding);
            const session = await apiGet<SessionState>('/account/session');
            if (ticket.isCurrent()) applySession(session);
          } else {
            await apiSend(operation === 'delete' ? 'DELETE' : 'POST', operation === 'delete' ? '/account' : '/auth/sign-out', operation === 'delete' ? { confirmation: 'DELETE MY ACCOUNT' } : {}, undefined, intendedBinding);
            if (ticket.isCurrent()) setState({ mode: 'beta', user: null, ready: true, error: null });
          }
        }, undefined, true);
      } catch (error) {
        if (ticket.isCurrent()) setState({ mode: 'beta', user: null, ready: true, error: error instanceof Error ? error.message : 'Please try again.' });
        throw error;
      } finally {
        stale = !ticket.isCurrent();
      }
    }).finally(() => {
      broadcast({ type: 'session-changed', id });
      if (stale && !epoch.busy && epoch.mounted) void refresh();
    });
    sessionIntent.current = { mode: 'beta', user: null };
    reset();
    broadcast({ type: 'transition-start', id });
    return result;
  }, [epoch, reset, refresh, broadcast]);
  const sendCode = useCallback(async (email: string) => {
    const ticket = epoch.ticket();
    await apiSend('POST', '/auth/email-otp/send-verification-otp', { email }, ticket.signal);
    return ticket.isCurrent();
  }, [epoch]);
  useEffect(() => {
    epoch.mount(); void refresh();
    const onOffline = () => {
      connected.current = false; setOnline(false); validationRequired.current = true;
      // Invalidate in-flight reads and writes, including ignored-abort transports.
      epoch.advance(); reset(); sessionIntent.current = { mode: 'beta', user: null };
    };
    const onExpiry = () => {
      if (validationRequired.current) {
        // A 401 from the check itself must reach its catch without cancelling its
        // ticket. A late write's 401/409 must leave a queued check free to finish.
        reset(); sessionIntent.current = { mode: 'beta', user: null };
        setState({ mode: 'beta', user: null, ready: false, error: 'We could not check your session. Please try again.' });
        return;
      }
      epoch.advance(); reset(); sessionIntent.current = { mode: 'beta', user: null };
      setState({ mode: 'beta', user: null, ready: true, error: null });
      channel.current?.postMessage({ type: 'session-changed' });
    };
    const onFocus = () => {
      if (!connected.current) return;
      if (remoteTransitions.current.size && navigator.locks) {
        // Recover a barrier left by a closed/crashed tab only after its cookie-write lock
        // has been released. A new transition invalidates this recovery ticket.
        const ticket = epoch.ticket();
        void withAuthLock(async () => {
          if (ticket.isCurrent()) remoteTransitions.current.clear();
        }, ticket.signal).then(() => { if (ticket.isCurrent()) void refresh(); }).catch(() => undefined);
      } else void refresh();
    };
    const onOnline = () => {
      connected.current = true; setOnline(true); validationRequired.current = true;
      epoch.advance(); reset();
      onFocus();
    };
    channel.current = new BroadcastChannel('5k-compass-session');
    channel.current.onmessage = ({ data }) => {
      if (data?.type === 'transition-start' && typeof data.id === 'string') {
        remoteTransitions.current.add(data.id); epoch.advance(); reset();
      } else if (data === 'session-changed' || data?.type === 'session-changed') {
        if (typeof data?.id === 'string') remoteTransitions.current.delete(data.id);
        epoch.advance(); reset(); void refresh();
      }
    };
    window.addEventListener('compass-session-expired', onExpiry);
    window.addEventListener('focus', onFocus);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      epoch.dispose(); remoteTransitions.current.clear();
      channel.current?.close(); channel.current = null;
      window.removeEventListener('compass-session-expired', onExpiry);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [epoch, refresh, reset]);
  useEffect(() => {
    if (!state.expiresAt || !state.user) return;
    const ticket = epoch.ticket();
    const timer = window.setTimeout(() => {
      if (ticket.isCurrent()) window.dispatchEvent(new Event('compass-session-expired'));
    }, Math.max(0, Date.parse(state.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [epoch, state.expiresAt, state.user]);
  // Old callbacks must retain their rendered intention even after another render signs in.
  const origin = { ...sessionIntent.current, user: sessionIntent.current.user ? { ...sessionIntent.current.user } : null };
  return <AuthContext value={{ ...state, ready: state.ready && !validationRequired.current, online, refresh, logout: () => transition('logout', origin), deleteAccount: () => transition('delete', origin),
    sendCode, signIn: (email, otp) => transition('login', origin, { email, otp }), captureOperation: () => epoch.ticket() }}>{children}</AuthContext>;
}
