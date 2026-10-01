import { Hammer } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from './Button';
import { EmptyState } from './EmptyState';

interface ComingSoonProps {
  feature: string;
  phase: string;
  description: ReactNode;
}

/** Placeholder for screens whose feature is scheduled in a later build phase. */
export function ComingSoon({ feature, phase, description }: ComingSoonProps) {
  return (
    <EmptyState
      icon={Hammer}
      title={`${feature} is on the way`}
      description={
        <>
          <p>{description}</p>
          <p className="mt-2 text-xs font-medium text-subtle">Planned for {phase}.</p>
        </>
      }
      action={
        <ButtonLink to="/explore" variant="secondary">
          Explore events meanwhile
        </ButtonLink>
      }
    />
  );
}
