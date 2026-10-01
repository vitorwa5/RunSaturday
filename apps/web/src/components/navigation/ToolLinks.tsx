import { ChevronRight, Columns3, Gem, Medal, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

export const TOOLS: { to: string; title: string; icon: LucideIcon }[] = [
  { to: '/pb-finder', title: 'PB Finder', icon: Timer },
  { to: '/where-could-i-place', title: 'Where Could I Place?', icon: Medal },
  { to: '/hidden-gems', title: 'Hidden Gems', icon: Gem },
  { to: '/compare', title: 'Compare events', icon: Columns3 },
];

/** Compact 2×2 links to the Saturday tools. */
export function ToolLinks() {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {TOOLS.map(({ to, title, icon: Icon }) => (
        <li key={to}>
          <Link to={to} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm font-semibold hover:bg-zinc-50">
            <Icon className="size-4 shrink-0 text-brand-700" aria-hidden />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
