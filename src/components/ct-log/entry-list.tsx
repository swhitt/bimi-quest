"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { UtcTime } from "@/components/ui/utc-time";
import { cn } from "@/lib/utils";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

interface EntryListProps {
  entries: DecodedCTEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  loading: boolean;
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

export const EntryList = memo(function EntryList({ entries, selectedIndex, onSelect, loading }: EntryListProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
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
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                No entries to display
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              const isSelected = entry.index === selectedIndex;
              const isPrecert = entry.leaf.entryType === "precert_entry";
              const subject = entry.cert?.subject;
              const issuer = entry.cert?.issuer;
              const isBIMI = entry.cert?.isBIMI;

              return (
                <tr
                  key={entry.index}
                  data-entry-index={entry.index}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(entry.index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(entry.index);
                    }
                  }}
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
                          !subject && "text-muted-foreground italic font-normal",
                        )}
                      >
                        {subject ?? "Parse error"}
                      </span>
                      {/* BIMI indicator dot - sits right after subject text */}
                      {isBIMI && (
                        <span
                          className="shrink-0 size-1.5 rounded-full bg-emerald-500 self-center"
                          aria-label="BIMI certificate"
                          title="BIMI certificate"
                        />
                      )}
                      {/* Entry type badge, pushed to end of subject line */}
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
    </div>
  );
});
