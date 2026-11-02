// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiGet } from '../api/client';
import { AuthEpoch, withAuthLock } from '../auth/epoch';
import { captureHistorySession, withHistorySession } from '../auth/historyOperation';
vi.mock('../api/client', () => ({ apiGet: vi.fn() }));
const original = { mode: 'beta' as const, user: { id: 'A' }, sessionBinding: 'A-session-1', expiresAt: '2099-01-01T00:00:00.000Z' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
class Locks {
  private tail: Promise<unknown> = Promise.resolve();
  request(_name: string, _options: object, action: () => Promise<unknown>) {
    // Ignore cancellation deliberately: callback-entry checks remain mandatory.
    const result = this.tail.then(action); this.tail = result.catch(() => undefined); return result;
  }
}
beforeEach(() => { vi.stubGlobal('navigator', { locks: new Locks() }); vi.mocked(apiGet).mockReset().mockResolvedValue(original as never); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
for (const operation of ['preview', 'commit', 'withdrawal']) {
  it.each(['another-account', 'replacement-session'])(`rejects queued ${operation} after %s before history access`, async replacement => {
    const entered = deferred(); const release = deferred();
    const holder = withAuthLock(async () => { entered.resolve(); await release.promise; }); await entered.promise;
    const dispatch = vi.fn().mockResolvedValue({});
    const result = withHistorySession(captureHistorySession(original), new AuthEpoch().ticket(), dispatch).catch(e => e);
    expect(apiGet).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
    vi.mocked(apiGet).mockResolvedValue({ ...original, user: { id: replacement === 'another-account' ? 'B' : 'A' }, sessionBinding: 'replacement' } as never);
    release.resolve(); await holder;
    expect(await result).toMatchObject({ name: 'AbortError' }); expect(dispatch).not.toHaveBeenCalled(); expect(apiGet).toHaveBeenCalledOnce();
  });
  it(`holds the auth lock through ${operation} completion even after epoch cancellation`, async () => {
    const epoch = new AuthEpoch(); const entered = deferred(); const response = deferred();
    const result = withHistorySession(original, epoch.ticket(), async () => { entered.resolve(); await response.promise; return 'saved'; }).catch(e => e);
    await entered.promise; epoch.advance();
    const transition = vi.fn().mockResolvedValue(undefined); const queued = withAuthLock(transition, undefined, true);
    await Promise.resolve(); expect(transition).not.toHaveBeenCalled();
    response.resolve(); expect(await result).toMatchObject({ name: 'AbortError' }); await queued; expect(transition).toHaveBeenCalledOnce();
  });
}
it('checks cancelled tickets after acquisition even if Web Locks ignores AbortSignal', async () => {
  const epoch = new AuthEpoch(); const entered = deferred(); const release = deferred();
  const holder = withAuthLock(async () => { entered.resolve(); await release.promise; }); await entered.promise;
  const dispatch = vi.fn(); const result = withHistorySession(original, epoch.ticket(), dispatch).catch(e => e);
  epoch.advance(); release.resolve(); await holder;
  expect(await result).toMatchObject({ name: 'AbortError' }); expect(apiGet).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
it('fails closed without cross-tab locks without reading session or history', async () => {
  vi.stubGlobal('navigator', {}); const dispatch = vi.fn();
  await expect(withHistorySession(original, new AuthEpoch().ticket(), dispatch)).rejects.toThrow(/updated browser/);
  expect(apiGet).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
it('does not dispatch after cancellation during session revalidation', async () => {
  const epoch = new AuthEpoch(); const checked = deferred(); const response = deferred(); const dispatch = vi.fn();
  vi.mocked(apiGet).mockImplementation(async () => { checked.resolve(); await response.promise; return original as never; });
  const result = withHistorySession(original, epoch.ticket(), dispatch).catch(e => e);
  await checked.promise; epoch.advance(); response.resolve();
  expect(await result).toMatchObject({ name: 'AbortError' }); expect(dispatch).not.toHaveBeenCalled();
});
