import { formatLongDate } from '@runsaturday/shared';
import { ChevronRight, Columns3, Gem, Medal, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { ComingSoon } from '../components/ui/ComingSoon';
import { PageHeader, SectionHeading } from '../components/ui/PageHeader';
import { upcomingSaturday } from '../lib/saturday';

const TOOLS: { to: string; title: string; description: string; icon: LucideIcon }[] = [
  { to: '/pb-finder', title: 'PB Finder', description: 'Find the fastest events for you', icon: Timer },
  { to: '/where-could-i-place', title: 'Where Could I Place?', description: 'How your time has historically placed', icon: Medal },
  { to: '/hidden-gems', title: 'Hidden Gems', description: 'Quieter, smaller or overlooked events', icon: Gem },
  { to: '/compare', title: 'Compare events', description: 'Side-by-side metrics for 2–4 events', icon: Columns3 },
];

export function SaturdayPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Plan My Saturday" subtitle={formatLongDate(upcomingSaturday())} />

      <ComingSoon
        feature="The Saturday Planner"
        phase="Phase 10"
        description="Set your start point, travel limit and goal, and get ranked recommendations with a clear “Why this?” for each."
      />

      <section aria-labelledby="tools">
        <SectionHeading>
          <span id="tools">Saturday tools</span>
        </SectionHeading>
        <ul className="space-y-2">
          {TOOLS.map(({ to, title, description, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:bg-zinc-50">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-muted">{description}</span>
                </span>
                <ChevronRight className="size-5 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
