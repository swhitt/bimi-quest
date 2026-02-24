"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { caSlugToName } from "./ca-slugs";

/**
 * Reads global filter values from both the URL path (/ca/slug) and search params.
 * The CA comes from the path segment, everything else from query params.
 * Returns a query string suitable for API calls.
 */
export function useGlobalFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract CA from /ca/slug/... pattern
  const pathMatch = pathname.match(/^\/ca\/([^/]+)/);
  const ca = pathMatch ? caSlugToName(pathMatch[1]) ?? null : null;

  const type = searchParams.get("type") || null;
  const validity = searchParams.get("validity") || null;
  const from = searchParams.get("from") || null;
  const to = searchParams.get("to") || null;
  const country = searchParams.get("country") || null;

  function buildApiParams(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (ca) params.set("ca", ca);
    if (type) params.set("type", type);
    if (validity) params.set("validity", validity);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (country) params.set("country", country);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v) params.set(k, v);
      }
    }
    return params.toString();
  }

  return { ca, type, validity, from, to, country, buildApiParams };
}
