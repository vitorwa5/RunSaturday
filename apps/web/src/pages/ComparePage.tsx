import { ComingSoon } from '../components/ui/ComingSoon';
import { PageHeader } from '../components/ui/PageHeader';

export function ComparePage() {
  return (
    <div className="space-y-4">
      <PageHeader back title="Compare events" subtitle="Put 2–4 events side by side." />
      <ComingSoon
        feature="Event comparison"
        phase="V2"
        description="Compare PB Score, difficulty, competition, participants, elevation, travel and historical placement in one table."
      />
    </div>
  );
}
