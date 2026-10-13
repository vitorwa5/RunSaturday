// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StartingAreaForm } from '../components/profile/StartingArea';
const { persist, operation } = vi.hoisted(() => ({ persist: vi.fn(), operation: { current: true } }));
vi.mock('../hooks/queries', () => ({ useSaveSettings: () => ({ mutateAsync: persist, isPending: false }) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ captureOperation: () => ({ isCurrent: () => operation.current, signal: new AbortController().signal }) }) }));
let root: Root; let element: HTMLDivElement;
let succeed: PositionCallback; let fail: PositionErrorCallback | null;
const request = vi.fn((success: PositionCallback, failure?: PositionErrorCallback | null) => { succeed = success; fail = failure ?? null; });
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: request } });
  request.mockClear(); persist.mockReset().mockResolvedValue({}); operation.current = true;
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
  await act(async () => { root.render(<StartingAreaForm initial={{ homeLat: null, homeLon: null, homeLabel: null, defaultTravelMinutes: 30, onboardingCompletedAt: null }} />); });
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals(); });
async function click(text: string) { const button = [...element.querySelectorAll('button')].find((b) => b.textContent === text)!; await act(async () => button.click()); }
it('only requests location after a tap and passes coarse values to the personal API mutation', async () => {
  expect(request).not.toHaveBeenCalled();
  await click('Use my approximate location');
  await act(async () => succeed({ coords: { latitude: 53.41234567, longitude: -2.61234567 } } as GeolocationPosition));
  await click('Save starting area');
  expect(persist).toHaveBeenCalledWith({ homeLat: 53.4, homeLon: -2.6, homeLabel: null, defaultTravelMinutes: 30 });
  expect(JSON.stringify(persist.mock.calls)).not.toContain('41234567');
});
it.each([1, 2, 3])('recovers from geolocation failure %s without a repeated permission prompt', async (code) => {
  await click('Use my approximate location'); await act(async () => fail!({ code } as GeolocationPositionError));
  expect(element.textContent).toContain('Enter a label or skip');
  await click('Save starting area');
  expect(persist).toHaveBeenCalledWith({ homeLat: null, homeLon: null, homeLabel: null, defaultTravelMinutes: 30 });
  expect(request).toHaveBeenCalledTimes(1);
});
it('ignores a precise geolocation callback after auth generation changes', async () => {
  await click('Use my approximate location'); operation.current = false;
  await act(async () => succeed({ coords: { latitude: 53.41234567, longitude: -2.61234567 } } as GeolocationPosition));
  expect(element.textContent).not.toContain('Approximate coordinates:');
  expect(persist).not.toHaveBeenCalled();
});
it('ignores a callback cancelled by clearing the starting area', async () => {
  await click('Use my approximate location'); await click('Clear starting area');
  await act(async () => succeed({ coords: { latitude: 53.41234567, longitude: -2.61234567 } } as GeolocationPosition));
  expect(element.textContent).not.toContain('Approximate coordinates:');
  expect(persist).toHaveBeenCalledWith({ homeLat: null, homeLon: null, homeLabel: null });
});
it('allows continuation when geolocation is unsupported', async () => {
  vi.stubGlobal('navigator', {}); await click('Use my approximate location');
  expect(element.textContent).toContain('not supported');
  await click('Save starting area'); expect(persist).toHaveBeenCalled();
});
it('does not perform effects when a browser callback arrives after unmount', async () => {
  await click('Use my approximate location');
  await act(async () => root.unmount());
  await act(async () => succeed({ coords: { latitude: 53.41234567, longitude: -2.61234567 } } as GeolocationPosition));
  expect(persist).not.toHaveBeenCalled(); expect(element.textContent).toBe('');
});
