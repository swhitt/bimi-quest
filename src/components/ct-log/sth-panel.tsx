"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UtcTime } from "@/components/ui/utc-time";

export interface STHResponse {
  tree_size: number;
  timestamp: number;
  sha256_root_hash: string;
  tree_head_signature: string;
}

interface STHPanelProps {
  sth: STHResponse | null;
  loading: boolean;
  lastPolled: number | null;
}

const numberFmt = new Intl.NumberFormat("en-US");

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />;
}

export function STHPanel({ sth, loading, lastPolled }: STHPanelProps) {
  const [, setTick] = useState(0);

  // Tick every 10s so relative times stay fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Log name */}
        <div className="space-y-0">
          <p className="text-sm font-semibold">Gorgon CT Log</p>
          <p className="text-[10px] text-muted-foreground">DigiCert</p>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Tree Size */}
        <div className="space-y-0">
          <p className="text-[10px] text-muted-foreground">Tree Size</p>
          {loading || !sth ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <p className="text-sm font-semibold tabular-nums">{numberFmt.format(sth.tree_size)}</p>
          )}
        </div>

        {/* STH Timestamp */}
        <div className="space-y-0">
          <p className="text-[10px] text-muted-foreground">STH Timestamp</p>
          {loading || !sth ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <p className="text-sm font-semibold tabular-nums">
              <UtcTime date={new Date(sth.timestamp)} compact />
            </p>
          )}
        </div>

        {/* Root Hash */}
        <div className="space-y-0 min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground">Root Hash</p>
          {loading || !sth ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-sm font-mono truncate cursor-help">{sth.sha256_root_hash}</p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono break-all max-w-80">{sth.sha256_root_hash}</p>
                </TooltipContent>
              </Tooltip>
              <CopyButton value={sth.sha256_root_hash} label="Root hash" />
            </div>
          )}
        </div>

        {/* Polled (client-side freshness) */}
        <div className="space-y-0">
          <p className="text-[10px] text-muted-foreground">Polled</p>
          {lastPolled ? (
            <p className="text-sm font-semibold tabular-nums">
              <UtcTime date={new Date(lastPolled)} compact />
            </p>
          ) : (
            <Skeleton className="h-4 w-12" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
