// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { apiGet, apiSend } from '../api/client';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(['get', 'send'])('ignores a late 401 from an aborted %s operation', async (method) => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
  const expiry = vi.fn(); window.addEventListener('compass-session-expired', expiry);
  const controller = new AbortController();
  const promise = method === 'get' ? apiGet('/profile', {}, controller.signal) : apiSend('POST', '/profile/performances', {}, controller.signal);
  controller.abort(); resolve(new Response('{}', { status: 401 }));
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' }); expect(expiry).not.toHaveBeenCalled();
  window.removeEventListener('compass-session-expired', expiry);
});
