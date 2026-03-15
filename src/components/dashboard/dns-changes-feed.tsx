"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DomainChip } from "@/components/domain-chip";
import { MiniPagination } from "@/components/dashboard/mini-pagination";
import { DiffBlock, computeDiff } from "@/components/dns/diff-block";
import { Skeleton } from "@/components/ui/skeleton";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";

export interface DnsChange {
  id: number;
  domain: string;
  recordType: string;
  changeType: string;
  previousRecord: Record<string, string> | null;
  newRecord: Record<string, string> | null;
  detectedAt: string | null;
}

export const CHANGE_STYLE: Record<string, { label: string; color: string }> = {
  policy_strengthened: { label: "policy strengthened", color: "text-green-600 dark:text-green-400" },
  policy_weakened: { label: "policy weakened", color: "text-red-600 dark:text-red-400" },
  record_created: { label: "record created", color: "text-green-600 dark:text-green-400" },
  record_removed: { label: "record removed", color: "text-red-600 dark:text-red-400" },
  record_ambiguous: { label: "ambiguous records", color: "text-amber-600 dark:text-amber-400" },
  logo_url_changed: { label: "logo url changed", color: "text-blue-600 dark:text-blue-400" },
  authority_url_changed: { label: "authority url changed", color: "text-blue-600 dark:text-blue-400" },
  declination_set: { label: "declined", color: "text-amber-600 dark:text-amber-400" },
  tags_modified: { label: "tags modified", color: "text-muted-foreground" },
};

export const POLICY_CHANGES = new Set(["policy_strengthened", "policy_weakened"]);

/** Sort priority: bimi first, then dmarc, then anything else */
const RECORD_TYPE_ORDER: Record<string, number> = { bimi: 0, dmarc: 1 };

/** Stable sort: BIMI before DMARC within the same refresh cycle (same minute) */
function sortBimiFirst(changes: DnsChange[]): DnsChange[] {
  return [...changes].sort((a, b) => {
    const ta = (a.detectedAt ?? "").slice(0, 16);
    const tb = (b.detectedAt ?? "").slice(0, 16);
    if (ta !== tb) return tb.localeCompare(ta);
    return (RECORD_TYPE_ORDER[a.recordType] ?? 9) - (RECORD_TYPE_ORDER[b.recordType] ?? 9);
  });
}

const PAGE_SIZE = 10;

export function DnsChangesFeed() {
  const [changes, setChanges] = useState<DnsChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dns-changes?limit=50")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data: DnsChange[] }) => {
        if (!cancelled) {
          setChanges(sortBimiFirst(json.data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div>
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dns record changes
        </span>
        <Skeleton className="h-[160px] mt-1" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dns record changes
        </span>
        <div className="flex h-[160px] flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">Failed to load</p>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(changes.length / PAGE_SIZE));
  const pageChanges = changes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/dns-changes"
          className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          dns record changes →
        </Link>
        <MiniPagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>
      {pageChanges.length > 0 ? (
        <div className="relative mt-1">
          <ol className="max-h-[240px] overflow-y-auto space-y-1 pb-4 scrollbar-thin">
            {pageChanges.map((c) => {
              const style = CHANGE_STYLE[c.changeType] ?? {
                label: c.changeType,
                color: "text-muted-foreground",
              };
              const showAll = POLICY_CHANGES.has(c.changeType);
              const diffs = computeDiff(c.previousRecord, c.newRecord, showAll);
              const hasDiffs = diffs.length > 0;
              const isOpen = expanded.has(c.id);

              return (
                <li key={c.id} className="rounded border px-2 py-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-[13px] w-full text-left"
                    onClick={() => {
                      if (!hasDiffs) return;
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      });
                    }}
                    style={{ cursor: hasDiffs ? "pointer" : "default" }}
                  >
                    {hasDiffs && (
                      <ChevronRight
                        className={cn(
                          "size-3 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[10px] uppercase w-[38px]",
                        c.recordType === "bimi" ? "text-blue-500" : "text-violet-500",
                      )}
                    >
                      {c.recordType}
                    </span>
                    <div className="min-w-0 flex-1 truncate">
                      <DomainChip domain={c.domain} size="xs" compact />
                    </div>
                    <span className={cn("font-mono text-[10px] shrink-0", style.color)}>{style.label}</span>
                    {c.detectedAt && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        <UtcTime date={c.detectedAt} relative />
                      </span>
                    )}
                  </button>
                  {isOpen && <DiffBlock diffs={diffs} />}
                </li>
              );
            })}
          </ol>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent" />
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No changes detected yet
        </div>
      )}
    </div>
  );
}
