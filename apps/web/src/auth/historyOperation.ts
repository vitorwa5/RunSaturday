import { apiGet } from '../api/client';
import { withAuthLock, type AuthTicket } from './epoch';

interface Session {
  mode: 'demo' | 'beta';
  user: { id: string } | null;
  sessionBinding?: string;
  expiresAt?: string;
}

/** Copy the originating identity; queued work must never adopt a newer render's session. */
export function captureHistorySession(session: Session): Session {
  return { mode: session.mode, user: session.user ? { id: session.user.id } : null,
    sessionBinding: session.sessionBinding, expiresAt: session.expiresAt };
}

/** Shares the authentication cookie-write lock, including the entire history response. */
export async function withHistorySession<T>(origin: Session, ticket: AuthTicket, dispatch: () => Promise<T>): Promise<T> {
  const assertCurrent = () => {
    if (!ticket.isCurrent()) throw new DOMException('History operation superseded', 'AbortError');
  };
  return withAuthLock(async () => {
    assertCurrent();
    const current = await apiGet<Session>('/account/session', {}, ticket.signal);
    assertCurrent();
    if (!origin.user || current.mode !== origin.mode || current.user?.id !== origin.user.id
      || current.sessionBinding !== origin.sessionBinding || current.expiresAt !== origin.expiresAt
      || (origin.mode === 'beta' && (!origin.sessionBinding || !current.expiresAt || !Number.isFinite(Date.parse(current.expiresAt)) || Date.parse(current.expiresAt) <= Date.now()))) {
      window.dispatchEvent(new Event('compass-session-expired'));
      throw new DOMException('Account session changed', 'AbortError');
    }
    // No await between the final check and dispatch. Once dispatched, do not use
    // the auth epoch's abort signal: cancelling fetch would release this lock
    // while the server could still be reading or committing the original request.
    assertCurrent();
    const result = await dispatch();
    assertCurrent();
    return result;
  }, ticket.signal, true);
}
