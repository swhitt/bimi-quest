/** Human-readable labels for DNS TXT record tag abbreviations. */
export const TAG_LABELS: Record<string, string> = {
  // DMARC
  v: "version",
  p: "policy",
  sp: "subdomain policy",
  pct: "percentage",
  rua: "aggregate reports",
  ruf: "forensic reports",
  adkim: "DKIM alignment",
  aspf: "SPF alignment",
  fo: "failure options",
  rf: "report format",
  ri: "reporting interval",
  // BIMI
  l: "logo URL",
  a: "authority URL",
  avp: "authority verification",
  lps: "logo protection",
};

export interface Diff {
  key: string;
  old: string | null;
  new_: string | null;
  changed: boolean;
}

/** Short enough to display inline with an arrow rather than vertical -/+ lines. */
const INLINE_THRESHOLD = 50;

export function computeDiff(
  prev: Record<string, string> | null,
  next: Record<string, string> | null,
  showAll = false,
): Diff[] {
  const allKeys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const diffs: Diff[] = [];
  for (const key of [...allKeys].sort()) {
    const oldVal = prev?.[key] ?? null;
    const newVal = next?.[key] ?? null;
    const changed = oldVal !== newVal;
    if (changed || showAll) {
      diffs.push({ key, old: oldVal, new_: newVal, changed });
    }
  }
  return diffs;
}

/** Find common prefix/suffix of two strings to highlight only the changed middle. */
export function splitDiff(a: string, b: string): { prefix: string; aDiff: string; bDiff: string; suffix: string } {
  let pLen = 0;
  while (pLen < a.length && pLen < b.length && a[pLen] === b[pLen]) pLen++;
  let sLen = 0;
  while (sLen < a.length - pLen && sLen < b.length - pLen && a[a.length - 1 - sLen] === b[b.length - 1 - sLen]) sLen++;
  return {
    prefix: a.slice(0, pLen),
    aDiff: a.slice(pLen, a.length - sLen),
    bDiff: b.slice(pLen, b.length - sLen),
    suffix: a.slice(a.length - sLen),
  };
}

export function TagKey({ tag }: { tag: string }) {
  const label = TAG_LABELS[tag];
  return label ? (
    <>
      {tag} <span className="text-muted-foreground">({label})</span>
    </>
  ) : (
    <>{tag}</>
  );
}

export function DiffBlock({ diffs }: { diffs: Diff[] }) {
  if (diffs.length === 0) return null;

  return (
    <div className="mt-1 rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed space-y-0.5">
      {diffs.map((d) => {
        // Unchanged context field
        if (!d.changed) {
          return (
            <div key={d.key} className="text-muted-foreground truncate">
              <TagKey tag={d.key} />: {d.old}
            </div>
          );
        }

        const isShort = (d.old?.length ?? 0) < INLINE_THRESHOLD && (d.new_?.length ?? 0) < INLINE_THRESHOLD;

        // Short values: inline with arrow
        if (isShort && d.old !== null && d.new_ !== null) {
          return (
            <div key={d.key}>
              <span className="text-muted-foreground">
                <TagKey tag={d.key} />:{" "}
              </span>
              <span className="text-red-700 dark:text-red-400 line-through decoration-red-400/30">{d.old}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="text-green-700 dark:text-green-400 font-medium">{d.new_}</span>
            </div>
          );
        }

        // Long values or add/remove: vertical with horizontal scroll + highlight
        const hl = d.old !== null && d.new_ !== null ? splitDiff(d.old, d.new_) : null;
        const hasHighlight = hl && hl.prefix.length + hl.suffix.length > 4;

        return (
          <div key={d.key}>
            <span className="text-muted-foreground">
              <TagKey tag={d.key} />
            </span>
            {d.old !== null && (
              <div className="pl-3 text-red-700 dark:text-red-400 overflow-x-auto whitespace-nowrap">
                <span className="select-none text-muted-foreground">- </span>
                {hasHighlight ? (
                  <>
                    <span className="opacity-50">{hl.prefix}</span>
                    <span className="bg-red-200/60 dark:bg-red-900/40 rounded-sm px-0.5">{hl.aDiff}</span>
                    <span className="opacity-50">{hl.suffix}</span>
                  </>
                ) : (
                  d.old
                )}
              </div>
            )}
            {d.new_ !== null && (
              <div className="pl-3 text-green-700 dark:text-green-400 overflow-x-auto whitespace-nowrap">
                <span className="select-none text-muted-foreground">+ </span>
                {hasHighlight ? (
                  <>
                    <span className="opacity-50">{hl.prefix}</span>
                    <span className="bg-green-200/60 dark:bg-green-900/40 rounded-sm px-0.5">{hl.bDiff}</span>
                    <span className="opacity-50">{hl.suffix}</span>
                  </>
                ) : (
                  d.new_
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
