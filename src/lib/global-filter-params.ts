/**
 * Pure function to build API query params from a searchParams record.
 * Shared by the RSC dashboard (server) and the useGlobalFilters hook (client).
 */
export function buildApiParamsFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams();
  const keys = ["ca", "root", "type", "mark", "validity", "from", "to", "country", "precert", "industry"];
  for (const key of keys) {
    const val = searchParams[key];
    if (typeof val === "string" && val) params.set(key, val);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return params.toString();
}
