/** Marks fictional development data wherever it is shown. */
export function DemoBadge() {
  return (
    <span
      className="inline-flex items-center rounded-md border border-caution/30 bg-caution-bg px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-caution uppercase"
      title="Fictional demo data for development. Not real event statistics."
    >
      Demo
    </span>
  );
}
