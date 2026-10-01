import { MapPinned } from 'lucide-react';
import { useState } from 'react';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterChip } from '../components/ui/FilterChip';
import { PageHeader } from '../components/ui/PageHeader';

const MODES = ['PB', 'Competition', 'Tourism', 'Quiet'] as const;

export function MapPage() {
  const [mode, setMode] = useState<(typeof MODES)[number]>('PB');
  return (
    <div className="space-y-4">
      <PageHeader title="Map" subtitle="Explore events by what matters to you." />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Map mode">
        {MODES.map((m) => (
          <FilterChip key={m} selected={m === mode} onClick={() => setMode(m)}>
            {m} mode
          </FilterChip>
        ))}
      </div>
      <EmptyState
        icon={MapPinned}
        title="The interactive map is on the way"
        description={
          <>
            <p>Pins coloured by {mode === 'PB' ? 'PB Score' : `${mode.toLowerCase()} information`}, with labels as well as colours, and quick filters.</p>
            <p className="mt-2 text-xs font-medium text-subtle">Planned for Phase 8.</p>
          </>
        }
        action={<ButtonLink to="/explore" variant="secondary">Browse the event list</ButtonLink>}
      />
    </div>
  );
}
