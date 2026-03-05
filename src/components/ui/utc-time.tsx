"use client";

import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UtcTimeProps {
  date: Date | string;
  /** Include hours:minutes in the primary display */
  showTime?: boolean;
  /** Show relative time ("3 months ago") below the date */
  relative?: boolean;
  /** Show compact relative time only ("2d ago") — still has tooltip */
  compact?: boolean;
  /** Apply destructive styling for expired dates */
  expired?: boolean;
  /** Extra lines appended to the tooltip */
  tooltipExtra?: React.ReactNode;
}

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** Full UTC string with seconds — used in tooltips and title attributes */
export function formatUtcFull(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function compactTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const absMs = Math.abs(ms);
  const mins = Math.floor(absMs / 60_000);
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (mins < 60) return fmt(Math.max(1, mins), "m");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return fmt(hours, "h");
  const days = Math.floor(hours / 24);
  if (days < 30) return fmt(days, "d");
  const months = Math.floor(days / 30);
  if (months < 12) return fmt(months, "mo");
  const years = Math.floor(months / 12);
  return fmt(years, "y");
}

function localStr(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

export function UtcTime({ date, showTime, relative, compact, expired, tooltipExtra }: UtcTimeProps) {
  const d = typeof date === "string" ? new Date(date) : date;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            {compact ? (
              <time dateTime={d.toISOString()} className="text-sm tabular-nums">
                {compactTimeAgo(d)}
              </time>
            ) : (
              <>
                <time
                  dateTime={d.toISOString()}
                  className={`text-sm tabular-nums ${expired ? "text-destructive" : ""}`}
                >
                  {showTime ? utcDateTime(d) : utcDate(d)}
                </time>
                {relative && (
                  <span className={`text-xs block ${expired ? "text-destructive" : "text-muted-foreground"}`}>
                    {formatDistanceToNow(d, { addSuffix: true })}
                  </span>
                )}
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono">{formatUtcFull(d)}</p>
          <p className="opacity-70">{localStr(d)}</p>
          {tooltipExtra}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
