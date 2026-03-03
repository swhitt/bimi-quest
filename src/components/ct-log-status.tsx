"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUtcFull } from "@/components/ui/utc-time";

interface CtLogStatusProps {
  logName: string;
  lastChecked: string;
}

function compactTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function staleness(d: Date): "fresh" | "stale" | "critical" {
  const mins = (Date.now() - d.getTime()) / 60_000;
  if (mins < 15) return "fresh";
  if (mins <= 60) return "stale";
  return "critical";
}

function localStr(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

const colorClass: Record<ReturnType<typeof staleness>, string> = {
  fresh: "text-muted-foreground",
  stale: "text-amber-700 dark:text-amber-400/70",
  critical: "text-foreground",
};

export function CtLogStatus({ logName, lastChecked }: CtLogStatusProps) {
  const d = new Date(lastChecked);
  const level = staleness(d);
  const label = logName.charAt(0).toUpperCase() + logName.slice(1);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`tabular-nums font-mono text-xs ${colorClass[level]}`}>
            {label}: {compactTimeAgo(d)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono">{formatUtcFull(d)}</p>
          <p className="opacity-70">{localStr(d)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
