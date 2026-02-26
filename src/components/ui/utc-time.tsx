"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface UtcTimeProps {
  date: Date | string;
  /** Include hours:minutes in the primary display */
  showTime?: boolean;
  /** Show relative time ("3 months ago") below the date */
  relative?: boolean;
  /** Apply destructive styling for expired dates */
  expired?: boolean;
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

function localStr(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

export function UtcTime({ date, showTime, relative, expired }: UtcTimeProps) {
  const d = typeof date === "string" ? new Date(date) : date;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <time
              dateTime={d.toISOString()}
              className={`text-sm tabular-nums ${expired ? "text-destructive" : ""}`}
            >
              {showTime ? utcDateTime(d) : utcDate(d)}
            </time>
            {relative && (
              <span
                className={`text-xs block ${expired ? "text-destructive" : "text-muted-foreground"}`}
              >
                {formatDistanceToNow(d, { addSuffix: true })}
              </span>
            )}
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
