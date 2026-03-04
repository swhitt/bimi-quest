"use client";

import { formatDistanceToNow } from "date-fns";

interface RelativeTimeProps {
  date: string;
  className?: string;
}

/**
 * Tiny client component that renders a relative time string (e.g. "3 minutes ago").
 * Extracted so parent components can remain Server Components while still using
 * date-fns' `formatDistanceToNow`, which depends on the client's current time.
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  return <span className={className}>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
}
