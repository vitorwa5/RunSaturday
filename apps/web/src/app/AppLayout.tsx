import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useEvents } from '../hooks/queries';

/** Global strip shown while the app is serving fictional DEMO data. */
function DemoDataStrip() {
  const { data } = useEvents();
  if (!data?.some((e) => e.source === 'demo')) return null;
  return (
    <p className="bg-caution-bg px-4 py-1.5 text-center text-xs font-medium text-caution">
      <strong className="font-bold tracking-wide">DEMO DATA</strong> · fictional events for development, not real statistics
    </p>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  return (
    <div className="min-h-dvh">
      <DemoDataStrip />
      <main className="mx-auto max-w-md px-4 pb-28">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
