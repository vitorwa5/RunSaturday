// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend } from '../api/client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { OfflineGate } from '../app/OfflineGate';
import { withAuthLock } from '../auth/epoch';

vi.mock('../api/client', () => ({ apiGet: vi.fn(), apiSend: vi.fn() }));
type Session = { mode: 'beta'; user: { id: string; email: string }; sessionBinding: string };
const session = (id: string, binding = id): Session => ({ mode: 'beta', user: { id, email: `${id}@example.test` }, sessionBinding: binding });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
let root: Root; let container: HTMLDivElement; let client: QueryClient;
let auth: ReturnType<typeof useAuth>; let online = true;
class Channel { onmessage = null; postMessage() {} close() {} }
function PrivateView() { auth = useAuth(); return <OfflineGate><p>Private {auth.user?.id ?? 'signed out'} {auth.sessionBinding}</p></OfflineGate>; }
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}><AuthProvider><PrivateView /></AuthProvider></QueryClientProvider>));
}
async function connect(value: boolean) { online = value; await act(async () => window.dispatchEvent(new Event(value ? 'online' : 'offline'))); }
beforeEach(() => {
  online = true;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('BroadcastChannel', Channel);
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, _options: object, action: () => Promise<unknown>) => action() } });
  vi.mocked(apiGet).mockReset().mockResolvedValue(session('A') as never); vi.mocked(apiSend).mockReset();
  client = new QueryClient(); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('offline session authority', () => {
  it('launches only the cached shell offline without requesting a session', async () => {
    online = false; await mount();
    expect(container.textContent).toContain('You’re offline'); expect(container.textContent).not.toContain('Private');
    expect(apiGet).not.toHaveBeenCalled();
  });
  it.each([session('B'), session('A', 'A-replacement')])('removes personal cache and waits for current authority on reconnect to $sessionBinding', async next => {
    await mount(); const old = auth.captureOperation();
    client.setQueryData(['personal', 'A', 'history'], ['old private history']);
    await connect(false);
    expect(old.isCurrent()).toBe(false); expect(client.getQueryCache().getAll()).toHaveLength(0);
    const check = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => check.promise as never);
    await connect(true);
    expect(container.textContent).not.toContain('Private'); expect(auth.ready).toBe(false);
    await act(async () => check.resolve(next));
    expect(container.textContent).toContain(`Private ${next.user.id} ${next.sessionBinding}`);
  });
  it('keeps failed reconnect blocked and permits an explicit successful retry', async () => {
    await mount(); await connect(false); vi.mocked(apiGet).mockRejectedValueOnce(new Error('unreachable'));
    await connect(true);
    expect(container.textContent).toContain('Session check unavailable'); expect(container.textContent).not.toContain('Private'); expect(auth.ready).toBe(false);
    vi.mocked(apiGet).mockResolvedValue(session('B') as never);
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Private B');
  });
  it('ignores an old ignored-abort session response after a second disconnect and reconnect', async () => {
    await mount(); await connect(false);
    const stale = deferred<Session>(); const current = deferred<Session>();
    vi.mocked(apiGet).mockImplementationOnce(() => stale.promise as never).mockImplementationOnce(() => current.promise as never);
    await connect(true); await connect(false); await connect(true);
    await act(async () => stale.resolve(session('A')));
    expect(container.textContent).not.toContain('Private');
    await act(async () => current.resolve(session('B')));
    expect(container.textContent).toContain('Private B');
  });
  it('does not reopen when online refresh skips an interrupted cookie write', async () => {
    await mount(); const write = deferred<null>();
    vi.mocked(apiSend).mockImplementationOnce(() => write.promise as never);
    let logout!: Promise<void>; await act(async () => { logout = auth.logout(); });
    await connect(false); await connect(true);
    expect(container.textContent).not.toContain('Private');
    const check = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => check.promise as never);
    await act(async () => { write.resolve(null); await logout; });
    expect(container.textContent).not.toContain('Private');
    await act(async () => check.resolve(session('B')));
    expect(container.textContent).toContain('Private B');
  });
});


describe('real HTTP expiry events cannot bypass session validation', () => {
  it.each(['bootstrap', 'reconnect'] as const)('keeps a %s HTTP 401 blocked without a retry loop', async phase => {
    const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(session('A'))));
    vi.stubGlobal('fetch', fetcher); vi.mocked(apiGet).mockImplementation(actual.apiGet);
    if (phase === 'reconnect') { await mount(); await connect(false); }
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Expired' } }), { status: 401 }));
    if (phase === 'bootstrap') await mount(); else await connect(true);
    expect(container.textContent).toContain('Session check unavailable');
    expect(container.textContent).not.toContain('Private'); expect(auth.ready).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(phase === 'bootstrap' ? 1 : 2);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(session('B'))));
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Private B');
  });

  it.each([401, 409])('waits for the queued authoritative check after a delayed unsignaled HTTP %s write', async status => {
    const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
    let tail: Promise<unknown> = Promise.resolve();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, _options: object, action: () => Promise<unknown>) => {
        const result = tail.then(action); tail = result.catch(() => undefined); return result;
      },
    } });
    const writeResponse = deferred<Response>(); const validationResponse = deferred<Response>();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(session('A'))));
    fetcher.mockImplementation((url: string, options: RequestInit) => {
      if (url.endsWith('/settings')) { expect(options.signal).toBeUndefined(); return writeResponse.promise; }
      return validationResponse.promise;
    });
    vi.stubGlobal('fetch', fetcher); vi.mocked(apiGet).mockImplementation(actual.apiGet);
    await mount();
    const write = withAuthLock(() => actual.apiSend('PATCH', '/settings', {}, undefined, 'A')).catch((error: Error) => error.name);
    await act(async () => { await Promise.resolve(); });
    await connect(false); await connect(true);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(auth.ready).toBe(false);
    await act(async () => {
      writeResponse.resolve(new Response(JSON.stringify({ error: { code: status === 409 ? 'session_changed' : 'unauthorized', message: 'Expired' } }), { status }));
      expect(await write).toBe('ApiError');
    });
    // The write releases its lock only after its complete response; validation then starts.
    expect(fetcher).toHaveBeenCalledTimes(3); expect(auth.ready).toBe(false);
    expect(container.textContent).not.toContain('Private');
    await act(async () => validationResponse.resolve(new Response(JSON.stringify(session('B')))));
    expect(container.textContent).toContain('Private B'); expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
