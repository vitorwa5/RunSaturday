import { ComingSoon } from '../components/ui/ComingSoon';
import { PageHeader } from '../components/ui/PageHeader';

export function PbFinderPage() {
  return (
    <div className="space-y-4">
      <PageHeader back title="PB Finder" subtitle="Find the fastest events for you." />
      <ComingSoon
        feature="PB Finder"
        phase="Phase 6"
        description="Events ranked by PB suitability within your travel limit, with course adjustment, elevation, surface and Saturday conditions."
      />
    </div>
  );
}
