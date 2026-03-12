/** Shared label-value row used across certificate detail sub-components. */
export function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="sm:w-40 sm:shrink-0 text-muted-foreground">{label}</span>
      <span className={`break-all min-w-0 ${mono ? "font-mono text-xs" : ""}`}>{value || "-"}</span>
    </div>
  );
}
