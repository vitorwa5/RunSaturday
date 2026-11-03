import { AuthProvider, useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { OfflineGate } from './app/OfflineGate';
import './styles/index.css';

function SessionApp() {
  const auth = useAuth();
  if (!auth.ready) return <p role="status" className="p-6 text-sm">Checking your session…</p>;
  if (!auth.user) return <SignIn />;
  return <RouterProvider key={auth.user.id} router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.VITE_PRIVATE_STAGING === 'true' && <p role="status" className="bg-amber-100 p-2 text-center text-sm text-amber-950">Private test version · synthetic data</p>}
    <QueryClientProvider client={queryClient}>
      <AuthProvider><OfflineGate><SessionApp /></OfflineGate></AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
