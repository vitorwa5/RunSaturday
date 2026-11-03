// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthEpoch, withAuthLock } from '../auth/epoch';
import { createSessionApi } from '../hooks/useSessionApi';
const origin = { mode: 'beta' as const, user: { id: 'A' }, sessionBinding: 'A-session', expiresAt: '2099-01-01T00:00:00.000Z' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
class Locks {
  private tail: Promise<unknown> = Promise.resolve();
  request(_name: string, _options: object, action: () => Promise<unknown>) {
    const result = this.tail.then(action); this.tail = result.catch(() => undefined); return result;
  }
}
let current = origin;
const fetcher = vi.fn();
beforeEach(() => {
  current = origin;
  vi.stubGlobal('navigator', { locks: new Locks() });
  vi.stubGlobal('fetch', fetcher.mockReset().mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('/account/session') ? current : {}), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());
for (const operation of ['settings', 'profile', 'performances', 'saveSettings', 'createPerformance', 'deletePerformance', 'saturday'] as const) {
  it.each(['B', 'A'])(`rejects queued ${operation} on replacement session for %s`, async owner => {
    const epoch = new AuthEpoch(); const entered = deferred(); const release = deferred();
    const holder = withAuthLock(async () => { entered.resolve(); await release.promise; }); await entered.promise;
    const api = createSessionApi(origin, () => epoch.ticket());
    const call = api[operation] as (...args: unknown[]) => Promise<unknown>;
    const result = call({}).catch(error => error);
    current = { ...origin, user: { id: owner }, sessionBinding: 'replacement' };
    release.resolve(); await holder;
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]![0]).toContain('/account/session');
  });
}
it('holds the cookie lock until a dispatched settings response completes despite cancellation', async () => {
  const epoch = new AuthEpoch(); const entered = deferred(); const response = deferred();
  fetcher.mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith('/account/session')) return new Response(JSON.stringify(current));
    expect(options.signal).toBeUndefined();
    expect(options.headers).toMatchObject({ 'X-Compass-Session-Binding': origin.sessionBinding });
    entered.resolve(); await response.promise; return new Response('{}');
  });
  const result = createSessionApi(origin, () => epoch.ticket()).saveSettings({}).catch(error => error);
  await entered.promise; epoch.advance();
  const cookieWrite = vi.fn(); const queued = withAuthLock(async () => { cookieWrite(); });
  await Promise.resolve(); expect(cookieWrite).not.toHaveBeenCalled();
  response.resolve(); expect(await result).toMatchObject({ name: 'AbortError' });
  await queued; expect(cookieWrite).toHaveBeenCalledOnce();
});
