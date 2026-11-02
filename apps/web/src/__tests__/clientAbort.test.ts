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

it('locks the personal UI when a history request is rejected for a stale session binding', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'session_changed', message: 'Session changed' } }), { status: 409 })));
  const expiry = vi.fn(); window.addEventListener('compass-session-expired', expiry);
  try {
    await expect(apiSend('POST', '/profile/history-import/preview', {})).rejects.toMatchObject({ status: 409, code: 'session_changed' });
    expect(expiry).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('compass-session-expired', expiry); }
});
it('does not lock a new session for an aborted history rejection still decoding its body', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409, ok: false, json: () => new Promise(r => { resolve = r; }) }));
  const expiry = vi.fn(); window.addEventListener('compass-session-expired', expiry);
  const controller = new AbortController();
  try {
    const result = apiSend('POST', '/profile/history-import/preview', {}, controller.signal);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    controller.abort(); resolve({ error: { code: 'session_changed', message: 'Session changed' } });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' }); expect(expiry).not.toHaveBeenCalled();
  } finally { window.removeEventListener('compass-session-expired', expiry); }
});
