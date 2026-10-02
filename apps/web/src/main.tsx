import { AuthProvider, useAuth } from './auth/AuthProvider';
import { SignIn } from './auth/SignIn';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import './styles/index.css';

function SessionApp() {
  const auth = useAuth();
  if (!auth.ready) return <p role="status" className="p-6 text-sm">Checking your session…</p>;
  if (!auth.user) return <SignIn />;
  return <RouterProvider key={auth.user.id} router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider><SessionApp /></AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
