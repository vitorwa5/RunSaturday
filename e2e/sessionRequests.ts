import type { APIRequestContext } from '@playwright/test';

/** Fixture/setup requests bind deliberately. Stale-view regressions use captured headers instead. */
export async function bindingHeaders(request: APIRequestContext) {
  const response = await request.get('/api/account/session');
  if (!response.ok()) throw new Error('Could not bootstrap the synthetic test session');
  const session = await response.json();
  return session.sessionBinding ? { 'x-compass-session-binding': session.sessionBinding as string } : {};
}

export async function boundGet(request: APIRequestContext, url: string) {
  return request.get(url, { headers: await bindingHeaders(request) });
}
