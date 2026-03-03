"use client";

import { Copy, Check } from "lucide-react";
import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface STHResponse {
  tree_size: number;
  timestamp: number;
  sha256_root_hash: string;
  tree_head_signature: string;
}

interface STHPanelProps {
  sth: STHResponse | null;
  loading: boolean;
}

const numberFmt = new Intl.NumberFormat("en-US");

function formatAbsoluteTime(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${Math.max(1, secs)}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function STHPanel({ sth, loading }: STHPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyHash = useCallback(() => {
    if (!sth) return;
    navigator.clipboard.writeText(sth.sha256_root_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sth]);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {/* Tree Size */}
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Tree Size</p>
          {loading || !sth ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <p className="text-sm font-semibold tabular-nums">{numberFmt.format(sth.tree_size)}</p>
          )}
        </div>

        {/* Timestamp */}
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Timestamp</p>
          {loading || !sth ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm font-semibold tabular-nums cursor-help">{formatRelativeTime(sth.timestamp)}</p>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono">{formatAbsoluteTime(sth.timestamp)}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Root Hash */}
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Root Hash</p>
          {loading || !sth ? (
            <Skeleton className="h-5 w-48" />
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
              <button
                type="button"
                onClick={copyHash}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy root hash"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
