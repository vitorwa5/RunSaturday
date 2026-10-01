import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useEvents } from '../hooks/queries';

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
