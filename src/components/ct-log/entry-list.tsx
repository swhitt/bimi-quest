"use client";

import { memo, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

interface EntryListProps {
  entries: DecodedCTEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  loading: boolean;
  newEntryCount?: number;
  onJumpToLive?: () => void;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i}>
          <td className="px-2 py-1.5">
            <div className="animate-pulse rounded bg-muted h-3.5 w-12 ml-auto" />
          </td>
          <td className="px-2 py-1.5 hidden sm:table-cell">
            <div className="animate-pulse rounded bg-muted h-3.5 w-20" />
          </td>
          <td className="px-2 py-1.5">
            <div className="space-y-1">
              <div className="animate-pulse rounded bg-muted h-3.5 w-40" />
              <div className="animate-pulse rounded bg-muted h-3 w-28" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export const EntryList = memo(function EntryList({
  entries,
  selectedIndex,
  onSelect,
  loading,
  newEntryCount,
  onJumpToLive,
}: EntryListProps) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  // Newest-first display order
  const displayEntries = [...entries].reverse();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, entryIndex: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(entryIndex);
        return;
      }

      // j/k and arrow key navigation between rows
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const row = (e.target as HTMLElement).closest("tr");
        const next = row?.nextElementSibling as HTMLElement | null;
        next?.focus();
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const row = (e.target as HTMLElement).closest("tr");
        const prev = row?.previousElementSibling as HTMLElement | null;
        prev?.focus();
      }
    },
    [onSelect],
  );

  return (
    <div className="overflow-x-auto rounded-lg border">
      {/* New entries banner */}
      {newEntryCount != null && newEntryCount > 0 && onJumpToLive && (
        <button
          type="button"
          onClick={onJumpToLive}
          className="w-full text-center text-xs py-1.5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {newEntryCount.toLocaleString()} new {newEntryCount === 1 ? "entry" : "entries"} — click to jump to latest
        </button>
      )}

      <table className="w-full text-sm" role="grid" aria-label="CT log entries">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-2 py-1.5 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wide w-14">
              #
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wide hidden sm:table-cell w-28">
              Time
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
              Subject / Issuer
            </th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {loading ? (
            <SkeletonRows />
          ) : displayEntries.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                No entries to display
              </td>
            </tr>
          ) : (
            displayEntries.map((entry) => {
              const isSelected = entry.index === selectedIndex;
              const isPrecert = entry.leaf.entryType === "precert_entry";
              const isBIMI = entry.cert?.isBIMI;
              const certType = entry.cert?.certType;
              // For BIMI certs, show org as primary; for others, show subject CN
              const primaryName = isBIMI ? (entry.cert?.organization ?? entry.cert?.subject) : entry.cert?.subject;
              const issuer = entry.cert?.issuer;

              return (
                <tr
                  key={entry.index}
                  data-entry-index={entry.index}
                  tabIndex={isSelected ? 0 : -1}
                  aria-selected={isSelected}
                  onClick={() => onSelect(entry.index)}
                  onKeyDown={(e) => handleKeyDown(e, entry.index)}
                  className={cn(
                    "border-b cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    isSelected && "bg-accent",
                  )}
                >
                  {/* Index */}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[11px] text-muted-foreground/60 align-top pt-2">
                    {entry.index.toLocaleString()}
                  </td>

                  {/* Timestamp - hidden on mobile */}
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground hidden sm:table-cell align-top pt-2">
                    <UtcTime date={entry.leaf.timestampDate} compact />
                  </td>

                  {/* Subject + Issuer stacked, Type badge inline */}
                  <td className="px-2 py-1.5 min-w-0">
                    {/* Subject line with type badge */}
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "truncate font-medium leading-snug",
                          !primaryName && "text-muted-foreground italic font-normal",
                        )}
                      >
                        {primaryName ?? "Parse error"}
                      </span>
                      {/* VMC/CMC badge for BIMI certs */}
                      {certType && (
                        <Badge
                          variant="default"
                          className={cn(
                            "shrink-0 text-[9px] px-1 py-0 leading-4 h-auto font-medium",
                            certType === "VMC"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
                          )}
                        >
                          {certType}
                        </Badge>
                      )}
                      {/* Plain BIMI dot for certs where type couldn't be determined */}
                      {isBIMI && !certType && (
                        <span
                          className="shrink-0 size-1.5 rounded-full bg-emerald-500 self-center"
                          aria-label="BIMI certificate"
                          title="BIMI certificate"
                        />
                      )}
                      {/* Entry type badge, pushed to end */}
                      <Badge
                        variant={isPrecert ? "outline" : "secondary"}
                        className={cn(
                          "shrink-0 ml-auto text-[9px] px-1 py-0 leading-4 h-auto font-normal",
                          isPrecert ? "text-muted-foreground" : "text-muted-foreground/80",
                        )}
                      >
                        {isPrecert ? "Pre" : "X.509"}
                      </Badge>
                    </div>

                    {/* Issuer line */}
                    <div className="truncate text-[11px] text-muted-foreground/60 leading-snug mt-0.5">
                      {issuer ?? <span className="italic">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Screen reader live region for entry count updates */}
      <div role="status" aria-live="polite" className="sr-only">
        {!loading && displayEntries.length > 0 && `Showing ${displayEntries.length} entries, newest first`}
      </div>
    </div>
  );
});
