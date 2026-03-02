import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";

/**
 * Fast autocomplete for hostname/org search.
 * Returns matching domains (from SAN lists) and orgs, deduped and ranked by recency.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  try {
    // Search SANs and orgs in parallel, ranked by similarity then cert count.
    // pg_trgm accelerates the ILIKE on subject_org via GIN index;
    // SAN unnest still does a seq scan but the dataset is small enough.
    const result = await db.execute(sql`
      (
        SELECT s.domain AS label, 'domain' AS type, COUNT(*)::int AS count
        FROM certificates, unnest(san_list) AS s(domain)
        WHERE lower(s.domain) LIKE ${pattern}
          AND s.domain NOT LIKE '%testcertificates.com'
          AND s.domain NOT LIKE '%grapefruitdesk.com'
        GROUP BY s.domain
        ORDER BY count DESC
        LIMIT 8
      )
      UNION ALL
      (
        SELECT subject_org AS label, 'org' AS type, COUNT(*)::int AS count
        FROM certificates
        WHERE subject_org ILIKE ${pattern}
        GROUP BY subject_org
        ORDER BY count DESC
        LIMIT 4
      )
    `);

    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": CACHE_PRESETS.SHORT_BROWSER },
    });
  } catch (err) {
    return apiError(err, "autocomplete.api.failed", "/api/autocomplete", "Failed to fetch autocomplete results");
  }
}
