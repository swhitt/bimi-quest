"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { caSlugToName } from "./ca-slugs";
import { buildApiParamsFromSearchParams } from "./global-filter-params";

/**
 * Reads global filter values from both the URL path (/ca/slug) and search params.
 * The issuer CA comes from the path segment, root CA from the "root" query param,
 * and everything else from query params.
 * Returns a query string suitable for API calls.
 */
export function useGlobalFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract issuer CA from /{page}/ca/{slug} pattern
  const pathMatch = pathname.match(/\/ca\/([^/]+)/);
  const ca = pathMatch ? (caSlugToName(pathMatch[1]) ?? null) : null;

  const root = searchParams.get("root") || null;
  const type = searchParams.get("type") || null;
  const mark = searchParams.get("mark") || null;
  const validity = searchParams.get("validity") || null;
  const from = searchParams.get("from") || null;
  const to = searchParams.get("to") || null;
  const country = searchParams.get("country") || null;
  const precert = searchParams.get("precert") || null;
  const industry = searchParams.get("industry") || null;

  function buildApiParams(extra?: Record<string, string>) {
    const merged: Record<string, string | undefined> = {
      ca: ca ?? undefined,
      root: root ?? undefined,
      type: type ?? undefined,
      mark: mark ?? undefined,
      validity: validity ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      country: country ?? undefined,
      precert: precert ?? undefined,
      industry: industry ?? undefined,
    };
    return buildApiParamsFromSearchParams(merged, extra);
  }

  return { ca, root, type, mark, validity, from, to, country, precert, industry, buildApiParams };
}
