// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLayout } from '../app/AppLayout';

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ mode: 'demo' }) }));
vi.mock('../hooks/queries', () => ({ useSettings: () => ({ data: {} }), useEvents: () => ({ data: [] }) }));
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('moves focus from mobile navigation to the opened page and retains the active tab label', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const router = createMemoryRouter([{ element: <AppLayout />, children: [
    { path: '/', element: <h1>Home page</h1> },
    { path: '/profile', element: <><h1>Your profile</h1><button>Edit profile</button></> },
  ] }]);
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<RouterProvider router={router} />));
  const profile = container.querySelector<HTMLAnchorElement>('nav a[href="/profile"]')!;
  profile.focus(); expect(document.activeElement).toBe(profile);
  await act(async () => profile.click());
  expect(container.querySelector('h1')?.textContent).toBe('Your profile');
  expect(document.activeElement).toBe(container.querySelector('main'));
  expect(profile.getAttribute('aria-current')).toBe('page');
  expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Main');
  expect(container.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
  const skip = container.querySelector<HTMLAnchorElement>('a[href="#main-content"]')!;
  skip.focus(); expect(document.activeElement).toBe(skip);
  await act(async () => skip.click());
  expect(document.activeElement).toBe(container.querySelector('main#main-content'));
  await act(async () => router.navigate(-1));
  expect(container.querySelector('h1')?.textContent).toBe('Home page');
  expect(document.activeElement).toBe(container.querySelector('main'));
  expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute('href')).toBe('/');
  router.dispose();
});
