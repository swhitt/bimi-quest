import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type RecordType, describeTagValue, detectRecordType, getTagLabel } from "@/lib/dns/tag-annotations";

export interface Diff {
  key: string;
  old: string | null;
  new_: string | null;
  changed: boolean;
}

/** Short enough to display inline with an arrow rather than vertical -/+ lines. */
const INLINE_THRESHOLD = 50;

/** Change types where we show all fields (not just changed ones) for context. */
const SHOW_ALL_CHANGE_TYPES = new Set(["policy_strengthened", "policy_weakened"]);

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
function splitDiff(a: string, b: string): { prefix: string; aDiff: string; bDiff: string; suffix: string } {
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

function TagKey({ tag, recordType }: { tag: string; recordType: RecordType }) {
  const label = getTagLabel(tag, recordType);
  return label ? (
    <>
      {tag} <span className="text-muted-foreground">({label})</span>
    </>
  ) : (
    <>{tag}</>
  );
}

function AnnotatedValue({
  tag,
  value,
  recordType,
  children,
}: {
  tag: string;
  value: string;
  recordType: RecordType;
  children: React.ReactNode;
}) {
  const desc = describeTagValue(tag, value, recordType);
  if (!desc) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 cursor-help">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 whitespace-pre-line font-sans">
        {desc}
      </TooltipContent>
    </Tooltip>
  );
}

interface DiffBlockProps {
  previousRecord: Record<string, string> | null;
  newRecord: Record<string, string> | null;
  changeType?: string;
}

/** Render an annotated diff between two parsed DNS TXT records. */
export function DiffBlock({ previousRecord, newRecord, changeType }: DiffBlockProps) {
  const showAll = changeType ? SHOW_ALL_CHANGE_TYPES.has(changeType) : false;
  const diffs = computeDiff(previousRecord, newRecord, showAll);
  if (diffs.length === 0) return null;

  const recordType =
    detectRecordType(newRecord) !== "unknown" ? detectRecordType(newRecord) : detectRecordType(previousRecord);

  return (
    <TooltipProvider>
      <div className="mt-1 rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed space-y-0.5">
        {diffs.map((d) => {
          // Unchanged context field
          if (!d.changed) {
            return (
              <div key={d.key} className="text-muted-foreground truncate">
                <TagKey tag={d.key} recordType={recordType} />:{" "}
                <AnnotatedValue tag={d.key} value={d.old!} recordType={recordType}>
                  {d.old}
                </AnnotatedValue>
              </div>
            );
          }

          const isShort = (d.old?.length ?? 0) < INLINE_THRESHOLD && (d.new_?.length ?? 0) < INLINE_THRESHOLD;

          // Short values: inline with arrow
          if (isShort && d.old !== null && d.new_ !== null) {
            return (
              <div key={d.key}>
                <span className="text-muted-foreground">
                  <TagKey tag={d.key} recordType={recordType} />:{" "}
                </span>
                <AnnotatedValue tag={d.key} value={d.old} recordType={recordType}>
                  <span className="text-red-700 dark:text-red-400 line-through decoration-red-400/30">{d.old}</span>
                </AnnotatedValue>
                <span className="text-muted-foreground"> → </span>
                <AnnotatedValue tag={d.key} value={d.new_} recordType={recordType}>
                  <span className="text-green-700 dark:text-green-400 font-medium">{d.new_}</span>
                </AnnotatedValue>
              </div>
            );
          }

          // Long values or add/remove: vertical with horizontal scroll + highlight
          const hl = d.old !== null && d.new_ !== null ? splitDiff(d.old, d.new_) : null;
          const hasHighlight = hl && hl.prefix.length + hl.suffix.length > 4;

          return (
            <div key={d.key}>
              <span className="text-muted-foreground">
                <TagKey tag={d.key} recordType={recordType} />
              </span>
              {d.old !== null && (
                <div className="pl-3 text-red-700 dark:text-red-400 overflow-x-auto whitespace-nowrap">
                  <span className="select-none text-muted-foreground">- </span>
                  <AnnotatedValue tag={d.key} value={d.old} recordType={recordType}>
                    {hasHighlight ? (
                      <>
                        <span className="opacity-70">{hl.prefix}</span>
                        <span className="bg-red-200/60 dark:bg-red-900/40 rounded-sm px-0.5">{hl.aDiff}</span>
                        <span className="opacity-70">{hl.suffix}</span>
                      </>
                    ) : (
                      d.old
                    )}
                  </AnnotatedValue>
                </div>
              )}
              {d.new_ !== null && (
                <div className="pl-3 text-green-700 dark:text-green-400 overflow-x-auto whitespace-nowrap">
                  <span className="select-none text-muted-foreground">+ </span>
                  <AnnotatedValue tag={d.key} value={d.new_} recordType={recordType}>
                    {hasHighlight ? (
                      <>
                        <span className="opacity-70">{hl.prefix}</span>
                        <span className="bg-green-200/60 dark:bg-green-900/40 rounded-sm px-0.5">{hl.bDiff}</span>
                        <span className="opacity-70">{hl.suffix}</span>
                      </>
                    ) : (
                      d.new_
                    )}
                  </AnnotatedValue>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/** Returns true if a DNS change has diffable content worth expanding. */
export function hasDiffContent(
  previousRecord: Record<string, string> | null,
  newRecord: Record<string, string> | null,
  changeType?: string,
): boolean {
  const showAll = changeType ? SHOW_ALL_CHANGE_TYPES.has(changeType) : false;
  return computeDiff(previousRecord, newRecord, showAll).length > 0;
}
