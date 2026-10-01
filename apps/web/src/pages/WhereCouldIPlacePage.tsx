import { ComingSoon } from '../components/ui/ComingSoon';
import { PageHeader } from '../components/ui/PageHeader';

export function WhereCouldIPlacePage() {
  return (
    <div className="space-y-4">
      <PageHeader back title="Where Could I Place?" subtitle="See how your 5K time would historically have placed." />
      <ComingSoon
        feature="Where Could I Place?"
        phase="Phase 4"
        description="Enter a time (or use your current form) and see historical placement ranges and Top-10 frequency at each event. Based on past results, never a prediction of who will turn up."
      />
    </div>
  );
}
