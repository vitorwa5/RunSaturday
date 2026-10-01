import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-card border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${className}`}
      {...props}
    />
  );
}
