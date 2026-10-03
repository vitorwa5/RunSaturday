// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend } from '../api/client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { AccountControls } from '../auth/AccountControls';

vi.mock('../api/client', () => ({ apiGet: vi.fn(), apiSend: vi.fn() }));
type Session = { mode: 'beta'; user: { id: string; email: string } | null; expiresAt?: string };
const session = (id: string): Session => ({ mode: 'beta', user: { id, email: `${id}@example.test` }, expiresAt: new Date(Date.now() + 60_000).toISOString() });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
class Channel {
  static channels = new Set<Channel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { Channel.channels.add(this); }
  postMessage(data: unknown) { for (const other of Channel.channels) if (other !== this && other.name === this.name) queueMicrotask(() => other.onmessage?.({ data })); }
  close() { Channel.channels.delete(this); this.onmessage = null; }
}
let auth: ReturnType<typeof useAuth>;
let server: Session;
const roots: Root[] = [];
const observed: string[] = [];
function Probe({ controls = false }: { controls?: boolean }) {
  auth = useAuth(); observed.push(auth.user?.id ?? 'none');
  return <div><p>{auth.user?.id ?? 'none'}</p>{controls && auth.ready && auth.user && <AccountControls key={auth.user.id} />}</div>;
}
async function mount(controls = false, strict = false) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const client = new QueryClient();
  const app = <QueryClientProvider client={client}><AuthProvider><Probe controls={controls} /></AuthProvider></QueryClientProvider>;
  await act(async () => { root.render(strict ? <StrictMode>{app}</StrictMode> : app); });
  return { root, container, hideControls: () => root.render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>) };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: object, action: () => Promise<unknown>) => action() } });
  observed.length = 0; server = session('A');
  vi.mocked(apiGet).mockReset().mockImplementation(async () => server as never);
  vi.mocked(apiSend).mockReset().mockImplementation(async (_method, path, input) => {
    server = path.includes('sign-in') ? session((input as { email: string }).email.split('@')[0]!) : { mode: 'beta', user: null };
    return null as never;
  });
});
afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); document.body.innerHTML = ''; Channel.channels.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('auth generation across deliberately delayed responses', () => {
  it('fails cookie-changing operations safely if cross-tab serialization is unavailable', async () => {
    await mount(); vi.stubGlobal('navigator', {});
    await act(async () => { await expect(auth.signIn('B@example.test', '123456')).rejects.toThrow(/updated browser/); });
    expect(apiSend).not.toHaveBeenCalled(); expect(auth.user).toBeNull(); expect(auth.error).toContain('updated browser');
  });
  it('does not restore A after logout and queued B login, even if transport ignores abort', async () => {
    await mount(); expect(auth.user?.id).toBe('A');
    const delayed = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => delayed.promise as never);
    let refresh!: Promise<void>; await act(async () => { refresh = auth.refresh(); });
    const logoutGate = deferred<null>(); const calls: string[] = [];
    vi.mocked(apiSend).mockImplementation(async (_method, path, input) => {
      calls.push(path);
      if (path.includes('sign-out')) { await logoutGate.promise; server = { mode: 'beta', user: null }; }
      else server = session((input as { email: string }).email.split('@')[0]!);
      return null as never;
    });
    let logout!: Promise<void>; let login!: Promise<void>;
    await act(async () => { logout = auth.logout(); login = auth.signIn('B@example.test', '123456'); window.dispatchEvent(new Event('focus')); });
    expect(calls).toEqual(['/auth/sign-out']); expect(auth.user).toBeNull();
    await act(async () => { logoutGate.resolve(null); await Promise.all([logout, login]); });
    expect(auth.user?.id).toBe('B'); const sinceB = observed.length;
    await act(async () => { delayed.resolve(session('A')); await refresh; });
    expect(auth.user?.id).toBe('B'); expect(observed.slice(sinceB)).not.toContain('A');
    expect(calls).toEqual(['/auth/sign-out', '/auth/sign-in/email-otp']);
  });

  it('expires locally and rejects a refresh result that arrives after expiry', async () => {
    vi.useFakeTimers(); server = { ...session('A'), expiresAt: new Date(Date.now() + 1000).toISOString() };
    await mount(); const old = auth.captureOperation();
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(auth.user).toBeNull(); expect(auth.ready).toBe(true); expect(old.isCurrent()).toBe(false);
    const delayed = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => delayed.promise as never);
    let refresh!: Promise<void>; await act(async () => { refresh = auth.refresh(); });
    await act(async () => { window.dispatchEvent(new Event('compass-session-expired')); delayed.resolve(session('A')); await refresh; });
    expect(auth.user).toBeNull();
  });

  it('invalidates a delayed read on cross-tab start and waits for the matching completion', async () => {
    await mount(); const delayed = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => delayed.promise as never);
    let refresh!: Promise<void>; await act(async () => { refresh = auth.refresh(); });
    const otherTab = new Channel('5k-compass-session');
    await act(async () => { otherTab.postMessage({ type: 'transition-start', id: 'other-login' }); });
    const writeLock = deferred<null>();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: object, action: () => Promise<unknown>) => { await writeLock.promise; return action(); } } });
    const count = vi.mocked(apiGet).mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); delayed.resolve(session('A')); await refresh; });
    expect(auth.user).toBeNull(); expect(vi.mocked(apiGet).mock.calls.length).toBe(count);
    server = session('B');
    await act(async () => { otherTab.postMessage({ type: 'session-changed', id: 'other-login' }); writeLock.resolve(null); });
    expect(auth.user?.id).toBe('B'); otherTab.close();
  });

  it('discards an unmounted provider response and survives StrictMode effect remount', async () => {
    const delayed = deferred<Session>(); vi.mocked(apiGet).mockImplementationOnce(() => delayed.promise as never);
    const first = await mount(); const old = auth.captureOperation();
    await act(async () => first.root.unmount()); roots.splice(roots.indexOf(first.root), 1);
    server = session('B'); await mount(false, true); expect(auth.user?.id).toBe('B');
    const sinceB = observed.length; await act(async () => delayed.resolve(session('A')));
    expect(old.isCurrent()).toBe(false); expect(auth.user?.id).toBe('B'); expect(observed.slice(sinceB)).not.toContain('A');
  });

  it('recovers a crashed-tab barrier on focus only after acquiring the shared write lock', async () => {
    await mount(); const otherTab = new Channel('5k-compass-session');
    await act(async () => otherTab.postMessage({ type: 'transition-start', id: 'crashed-tab' })); otherTab.close();
    const release = deferred<null>();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: object, action: () => Promise<unknown>) => { await release.promise; return action(); } } });
    const count = vi.mocked(apiGet).mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(auth.user).toBeNull(); expect(vi.mocked(apiGet).mock.calls.length).toBe(count);
    server = session('B'); await act(async () => { release.resolve(null); });
    expect(auth.user?.id).toBe('B');
  });

  it('does not download A export when it finishes after B becomes active', async () => {
    const { container } = await mount(true); const delayed = deferred<unknown>();
    vi.mocked(apiGet).mockImplementation(async (path) => path === '/account/export' ? delayed.promise as never : server as never);
    const blob = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: blob });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Export my data')!.click(); });
    const request = vi.mocked(apiGet).mock.calls.find(([path]) => path === '/account/export')!;
    await act(async () => { await auth.logout(); await auth.signIn('B@example.test', '123456'); });
    expect(auth.user?.id).toBe('B'); expect(request[2]?.aborted).toBe(true);
    await act(async () => delayed.resolve({ profile: { id: 'A' }, performances: ['private-A'] }));
    expect(blob).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled(); expect(container.textContent).not.toContain('private-A');
  });

  it('discards export after AccountControls unmounts while the same session remains current', async () => {
    const { container, hideControls } = await mount(true); const delayed = deferred<unknown>();
    vi.mocked(apiGet).mockImplementationOnce(() => delayed.promise as never);
    const blob = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: blob });
    const ticket = auth.captureOperation();
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Export my data')!.click(); });
    await act(async () => hideControls());
    expect(ticket.isCurrent()).toBe(true);
    await act(async () => delayed.resolve({ profile: { id: 'A' } })); expect(blob).not.toHaveBeenCalled();
  });
});
