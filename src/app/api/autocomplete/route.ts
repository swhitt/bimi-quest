import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";
import { log } from "@/lib/logger";

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
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    log('error', 'autocomplete.api.failed', { error: String(err), route: '/api/autocomplete' });
    return NextResponse.json(
      { error: "Failed to fetch autocomplete results" },
      { status: 500 }
    );
  }
}
