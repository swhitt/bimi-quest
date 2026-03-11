import { getDefaultFromDateISO } from "@/lib/default-dates";

const STORAGE_KEY = "bimi-filters";

/** Filter keys persisted across page navigations via sessionStorage. */
export const GLOBAL_FILTER_KEYS = [
  "from",
  "to",
  "type",
  "mark",
  "validity",
  "precert",
  "root",
  "industry",
  "country",
  "expiresFrom",
  "expiresTo",
] as const;

interface StoredFilters {
  params: Record<string, string>;
  caSlug: string;
}

/** Save current filter state to sessionStorage. */
export function saveFilterState(searchParams: URLSearchParams, caSlug: string): void {
  try {
    const params: Record<string, string> = {};
    for (const key of GLOBAL_FILTER_KEYS) {
      const val = searchParams.get(key);
      if (val) params[key] = val;
    }
    const state: StoredFilters = { params, caSlug };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (SSR, private browsing quota exceeded)
  }
}

/** Load persisted filter state. Returns null if nothing stored or unavailable. */
export function loadFilterState(): StoredFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFilters;
    // Validate shape
    if (!parsed || typeof parsed.params !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True if the URL already has any global filter params or a CA path segment. */
export function hasAnyFilterParams(searchParams: URLSearchParams, pathname: string): boolean {
  if (pathname.includes("/ca/")) return true;
  return GLOBAL_FILTER_KEYS.some((key) => searchParams.has(key));
}

/**
 * Build a fully-materialized share URL from the current page state.
 * Resolves the default 12-month lookback to an absolute date so the
 * recipient sees the exact same data range regardless of when they open it.
 */
export function buildShareUrl(pathname: string, searchParams: URLSearchParams, caSlug: string): string {
  const basePath = pathname.replace(/\/page\/\d+$/, "").replace(/\/ca\/[^/]+$/, "") || "/";
  const useQueryCa = basePath === "/domains";
  const caSuffix = !useQueryCa && caSlug ? `/ca/${caSlug}` : "";
  const base = basePath === "/" ? caSuffix || "/" : `${basePath}${caSuffix}`;

  const params = new URLSearchParams();

  // Copy existing filter params
  for (const key of GLOBAL_FILTER_KEYS) {
    const val = searchParams.get(key);
    if (val) params.set(key, val);
  }

  // Materialize the default date if no explicit "from" is set
  if (!searchParams.has("from")) {
    params.set("from", getDefaultFromDateISO());
  }

  // Handle CA in query param mode (domains page)
  if (useQueryCa && caSlug) params.set("ca", caSlug);

  const qs = params.toString();
  return `${window.location.origin}${qs ? `${base}?${qs}` : base}`;
}

/**
 * Build a URL for hydrating a page from stored filter state.
 * Used when navigating to a data page that has no filter params in the URL.
 */
export function buildHydratedUrl(pathname: string, stored: StoredFilters): string | null {
  if (Object.keys(stored.params).length === 0 && !stored.caSlug) return null;

  const basePath = pathname.replace(/\/page\/\d+$/, "").replace(/\/ca\/[^/]+$/, "") || "/";
  const useQueryCa = basePath === "/domains";
  const caSuffix = !useQueryCa && stored.caSlug ? `/ca/${stored.caSlug}` : "";
  const base = basePath === "/" ? caSuffix || "/" : `${basePath}${caSuffix}`;

  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(stored.params)) {
    if (val) params.set(key, val);
  }
  if (useQueryCa && stored.caSlug) params.set("ca", stored.caSlug);

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
