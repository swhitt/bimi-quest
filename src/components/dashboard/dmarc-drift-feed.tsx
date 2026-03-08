"use client";

import { useEffect, useState } from "react";
import { HostChip } from "@/components/host-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";

interface DmarcChange {
  domain: string;
  previousPolicy: string | null;
  newPolicy: string;
  previousPct: number | null;
  newPct: number | null;
  detectedAt: string | null;
}

/** Ordered severity of DMARC policies for determining upgrade vs downgrade. */
const POLICY_RANK: Record<string, number> = { none: 0, quarantine: 1, reject: 2 };

function policyRank(policy: string | null): number {
  return policy ? (POLICY_RANK[policy] ?? -1) : -1;
}

/** Returns true if the change represents a stricter DMARC posture. */
function isUpgrade(prev: string | null, next: string): boolean {
  return policyRank(next) > policyRank(prev);
}

/** Short display label for a policy value. */
function policyLabel(policy: string | null): string {
  if (!policy) return "unknown";
  return policy;
}

/** Format pct value for display, omitting when it's the default 100. */
function pctSuffix(pct: number | null): string {
  if (pct === null || pct === 100) return "";
  return ` (${pct}%)`;
}

export function DmarcDriftFeed() {
  const [changes, setChanges] = useState<DmarcChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dmarc-drift?limit=10")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data: DmarcChange[] }) => {
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
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          dmarc policy changes
        </span>
        <Skeleton className="h-[160px] mt-1" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          dmarc policy changes
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

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">dmarc policy changes</span>
      {changes.length > 0 ? (
        <ol className="mt-1 space-y-0.5">
          {changes.map((c, i) => {
            const upgrade = isUpgrade(c.previousPolicy, c.newPolicy);
            const downgrade = !upgrade && policyRank(c.newPolicy) < policyRank(c.previousPolicy);
            return (
              <li key={`${c.domain}-${i}`} className="flex items-center gap-1.5 text-[13px] py-0.5 px-1 rounded">
                <div className="min-w-0 flex-1 truncate">
                  <HostChip hostname={c.domain} showExternal={false} size="xs" compact />
                </div>
                <span
                  className={cn(
                    "font-mono text-[11px] shrink-0",
                    upgrade && "text-green-600 dark:text-green-400",
                    downgrade && "text-red-600 dark:text-red-400",
                    !upgrade && !downgrade && "text-muted-foreground",
                  )}
                >
                  {policyLabel(c.previousPolicy)}
                  {pctSuffix(c.previousPct)} &rarr; {policyLabel(c.newPolicy)}
                  {pctSuffix(c.newPct)}
                </span>
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
