import { Compass } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="pt-8">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="That page does not exist. Head back home to find your Saturday run."
        action={<ButtonLink to="/">Go home</ButtonLink>}
      />
    </div>
  );
}
