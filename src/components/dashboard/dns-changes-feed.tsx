"use client";

import { useEffect, useState } from "react";
import { HostChip } from "@/components/host-chip";
import { MiniPagination } from "@/components/dashboard/mini-pagination";
import { DiffBlock, computeDiff } from "@/components/dns/diff-block";
import { Skeleton } from "@/components/ui/skeleton";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";

export interface DnsChange {
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
  logo_url_changed: { label: "logo url changed", color: "text-blue-600 dark:text-blue-400" },
  logo_changed: { label: "logo url changed", color: "text-blue-600 dark:text-blue-400" },
  authority_url_changed: { label: "authority url changed", color: "text-blue-600 dark:text-blue-400" },
  authority_changed: { label: "authority url changed", color: "text-blue-600 dark:text-blue-400" },
  declination_set: { label: "declined", color: "text-amber-600 dark:text-amber-400" },
  tags_modified: { label: "tags modified", color: "text-muted-foreground" },
};

const POLICY_CHANGES = new Set(["policy_strengthened", "policy_weakened"]);

const PAGE_SIZE = 5;

export function DmarcDriftFeed() {
  const [changes, setChanges] = useState<DnsChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dmarc-drift?limit=50")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data: DnsChange[] }) => {
        if (!cancelled) {
          setChanges(json.data);
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
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dns record changes
        </span>
        <MiniPagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>
      {pageChanges.length > 0 ? (
        <ol className="mt-1 space-y-2">
          {pageChanges.map((c, i) => {
            const style = CHANGE_STYLE[c.changeType] ?? {
              label: c.changeType,
              color: "text-muted-foreground",
            };
            const showAll = POLICY_CHANGES.has(c.changeType);
            const diffs = computeDiff(c.previousRecord, c.newRecord, showAll);

            return (
              <li key={`${c.domain}-${c.recordType}-${i}`} className="rounded border px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10px] uppercase w-[38px]",
                      c.recordType === "bimi" ? "text-blue-500" : "text-violet-500",
                    )}
                  >
                    {c.recordType}
                  </span>
                  <div className="min-w-0 flex-1 truncate">
                    <HostChip hostname={c.domain} size="xs" compact />
                  </div>
                  <span className={cn("font-mono text-[10px] shrink-0", style.color)}>{style.label}</span>
                  {c.detectedAt && (
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      <UtcTime date={c.detectedAt} relative />
                    </span>
                  )}
                </div>
                <DiffBlock diffs={diffs} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No changes detected yet
        </div>
      )}
    </div>
  );
}
