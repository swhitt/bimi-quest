"use client";

import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  label?: string;
  rows: { color: string; name: string; value: string | number }[];
  className?: string;
}

export function ChartTooltipContent({ label, rows, className }: ChartTooltipProps) {
  return (
    <div className={cn("rounded-lg border bg-popover px-3 py-2 shadow-md text-sm text-popover-foreground", className)}>
      {label && <p className="mb-1.5 font-medium text-xs text-muted-foreground">{label}</p>}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="ml-auto pl-4 font-mono font-medium tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
