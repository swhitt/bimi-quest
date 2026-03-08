"use client";

import { useEffect, useReducer } from "react";
import { formatDistanceToNow } from "date-fns";

interface RelativeTimeProps {
  date: string;
  className?: string;
}

/**
 * Renders a relative time string (e.g. "3 minutes ago") only on the client
 * to avoid hydration mismatch from differing server/client Date.now().
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);

  if (!mounted) return <span className={className} />;
  return <span className={className}>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
}
