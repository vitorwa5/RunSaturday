import { Link, useLocation } from 'react-router';
import { NAV_ITEMS, isNavItemActive } from './navItems';

/** Fixed, labelled five-tab navigation. Active state uses weight, an indicator bar and aria-current. */
export function BottomNavigation() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? 'font-bold text-brand-700' : 'font-medium text-muted hover:text-ink'
                }`}
              >
                {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-brand-600" aria-hidden />}
                <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
