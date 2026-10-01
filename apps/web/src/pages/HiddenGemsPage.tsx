import { ComingSoon } from '../components/ui/ComingSoon';
import { PageHeader } from '../components/ui/PageHeader';

export function HiddenGemsPage() {
  return (
    <div className="space-y-4">
      <PageHeader back title="Hidden Gems" subtitle="Quieter, smaller or overlooked events near you." />
      <ComingSoon
        feature="Hidden Gems"
        phase="Phase 7"
        description="Gem Scores you can tune: quiet, easy to place, fast, new to you, or small field, each with a clear “Why it is a gem”."
      />
    </div>
  );
}
