"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUtcFull } from "@/components/ui/utc-time";

function formatLocal(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(d);
}

export function CommitBadge({ sha, buildTime }: { sha: string; buildTime: string }) {
  const d = new Date(buildTime);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-2 text-[10px] opacity-40 font-mono cursor-default">{sha.slice(0, 7)}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-[10px] text-muted-foreground mb-1">Built</p>
        <p className="font-mono">{formatUtcFull(d)}</p>
        <p className="opacity-70">{formatLocal(d)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
