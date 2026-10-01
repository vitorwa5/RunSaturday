import type { ReactNode } from 'react';

/** Label/value rows for fact sheets (Overview, Info). */
export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm">
          <dt className="text-muted">{item.label}</dt>
          <dd className="text-right font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
