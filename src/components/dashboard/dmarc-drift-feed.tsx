"use client";

import { useEffect, useState } from "react";
import { HostChip } from "@/components/host-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";

interface DnsChange {
  domain: string;
  recordType: string;
  changeType: string;
  previousRecord: Record<string, string> | null;
  newRecord: Record<string, string> | null;
  detectedAt: string | null;
}

const CHANGE_STYLE: Record<string, { label: string; color: string }> = {
  policy_strengthened: { label: "strengthened", color: "text-green-600 dark:text-green-400" },
  policy_weakened: { label: "weakened", color: "text-red-600 dark:text-red-400" },
  record_created: { label: "created", color: "text-green-600 dark:text-green-400" },
  record_removed: { label: "removed", color: "text-red-600 dark:text-red-400" },
  logo_changed: { label: "logo changed", color: "text-blue-600 dark:text-blue-400" },
  authority_changed: { label: "authority changed", color: "text-blue-600 dark:text-blue-400" },
  declination_set: { label: "declined", color: "text-amber-600 dark:text-amber-400" },
  tags_modified: { label: "modified", color: "text-muted-foreground" },
};

function changeDetail(c: DnsChange): string {
  if (c.recordType === "dmarc" && c.previousRecord?.p && c.newRecord?.p) {
    return `${c.previousRecord.p} → ${c.newRecord.p}`;
  }
  const style = CHANGE_STYLE[c.changeType];
  return style?.label ?? c.changeType;
}

export function DmarcDriftFeed() {
  const [changes, setChanges] = useState<DnsChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dmarc-drift?limit=20")
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
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dns record changes</span>
        <Skeleton className="h-[160px] mt-1" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dns record changes</span>
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

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dns record changes</span>
      {changes.length > 0 ? (
        <ol className="mt-1 space-y-0.5">
          {changes.map((c, i) => {
            const style = CHANGE_STYLE[c.changeType] ?? { label: c.changeType, color: "text-muted-foreground" };
            return (
              <li
                key={`${c.domain}-${c.recordType}-${i}`}
                className="flex items-center gap-1.5 text-[13px] py-0.5 px-1 rounded"
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] uppercase w-[38px]",
                    c.recordType === "bimi" ? "text-blue-500" : "text-violet-500",
                  )}
                >
                  {c.recordType}
                </span>
                <div className="min-w-0 flex-1 truncate">
                  <HostChip hostname={c.domain} showExternal={false} size="xs" compact />
                </div>
                <span className={cn("font-mono text-[11px] shrink-0", style.color)}>{changeDetail(c)}</span>
                {c.detectedAt && (
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    <UtcTime date={c.detectedAt} relative />
                  </span>
                )}
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
