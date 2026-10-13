import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useEvents, useSettings } from '../hooks/queries';
import { useAuth } from '../auth/AuthProvider';

/** Global strip shown while the app is serving fictional DEMO data. */
function DemoDataStrip() {
  const { data } = useEvents();
  if (!data?.some((e) => e.source === 'demo')) return null;
  return (
    <p className="border-b border-caution/15 bg-caution-bg/70 px-4 py-1 text-center text-[11px] font-medium text-caution">
      <strong className="font-bold tracking-wide">DEMO DATA</strong> · fictional events, not real statistics
    </p>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const settings = useSettings();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  if (auth.mode !== 'demo' && settings.data && !settings.data.onboardingCompletedAt && pathname === '/') return <Navigate to="/onboarding" replace />;

  return (
    <div className="min-h-dvh">
      <DemoDataStrip />
      <main className="mx-auto max-w-md px-4 pb-28">
        {auth.mode !== 'demo' && settings.data && !settings.data.onboardingCompletedAt && pathname !== '/onboarding' && <p className="py-3 text-sm"><Link className="font-semibold text-brand-700" to="/onboarding">Finish your welcome setup</Link> · optional location and run history</p>}
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
