"use client";

import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";

interface EntryListProps {
  entries: DecodedCTEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  loading: boolean;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i}>
          <td className="px-3 py-2">
            <div className="animate-pulse rounded bg-muted h-4 w-16" />
          </td>
          <td className="px-3 py-2">
            <div className="animate-pulse rounded bg-muted h-4 w-24" />
          </td>
          <td className="px-3 py-2">
            <div className="animate-pulse rounded bg-muted h-4 w-14" />
          </td>
          <td className="px-3 py-2">
            <div className="animate-pulse rounded bg-muted h-4 w-32" />
          </td>
          <td className="px-3 py-2 hidden md:table-cell">
            <div className="animate-pulse rounded bg-muted h-4 w-28" />
          </td>
          <td className="px-3 py-2">
            <div className="animate-pulse rounded bg-muted h-4 w-4" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function EntryList({ entries, selectedIndex, onSelect, loading }: EntryListProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Timestamp</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Subject</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Issuer</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground w-12">BIMI</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                No entries to display
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              const isSelected = entry.index === selectedIndex;
              return (
                <tr
                  key={entry.index}
                  onClick={() => onSelect(entry.index)}
                  className={cn(
                    "border-b cursor-pointer transition-colors hover:bg-muted/50",
                    isSelected && "bg-accent",
                  )}
                >
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {entry.index.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {formatTimestamp(entry.leaf.timestampDate)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={entry.leaf.entryType === "x509_entry" ? "secondary" : "outline"}
                      className="text-[10px] px-1.5"
                    >
                      {entry.leaf.entryType === "x509_entry" ? "X.509" : "Precert"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 max-w-[200px] md:max-w-[300px] truncate">
                    {entry.cert?.subject ?? <span className="text-muted-foreground italic">Parse error</span>}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate hidden md:table-cell text-muted-foreground">
                    {entry.cert?.issuer ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {entry.cert?.isBIMI && (
                      <Shield className="size-4 text-emerald-500 inline-block" aria-label="BIMI certificate" />
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
