/** Named cache presets for consistent Cache-Control headers across API routes. */
export const CACHE_PRESETS = {
  /** 60s edge cache, 5 min stale-while-revalidate */
  SHORT: "public, s-maxage=60, stale-while-revalidate=300",
  /** 60s browser+edge cache, 5 min stale-while-revalidate */
  SHORT_BROWSER: "public, max-age=60, stale-while-revalidate=300",
  /** 2 min edge cache, 10 min stale-while-revalidate */
  MEDIUM: "public, s-maxage=120, stale-while-revalidate=600",
  /** 5 min edge cache, 10 min stale-while-revalidate */
  MEDIUM_LONG: "public, s-maxage=300, stale-while-revalidate=600",
  /** 1 hour edge cache, 1 day stale-while-revalidate */
  LONG: "public, s-maxage=3600, stale-while-revalidate=86400",
  /** 1 day edge cache, 1 hour stale-while-revalidate (e.g. OG images) */
  LONG_STATIC: "public, s-maxage=86400, stale-while-revalidate=3600",
  /** 1 day browser+edge cache, immutable-like for static content */
  STATIC: "public, max-age=86400",
  /** 1 day browser+edge cache (content-addressed assets like logos) */
  IMMUTABLE: "public, max-age=86400, s-maxage=86400",
} as const;
