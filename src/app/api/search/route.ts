import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { escapeLike } from "@/lib/db/certificate-filters";

/**
 * Universal search endpoint for the command palette.
 * Searches across domains, certificates (by org/cn/serial), and organizations.
 * Returns max 5 results per category.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2 || q.length > 200) {
    return NextResponse.json({ domains: [], certificates: [], orgs: [] });
  }

  const pattern = `%${escapeLike(q.toLowerCase())}%`;

  try {
    const [domainRows, certRows, orgRows] = await Promise.all([
      // Domains: match on domain name
      db.execute(sql`
        SELECT domain, bimi_grade AS grade
        FROM domain_bimi_state
        WHERE domain ILIKE ${pattern}
        ORDER BY last_checked DESC NULLS LAST
        LIMIT 5
      `),

      // Certificates: match on subjectOrg, subjectCn, or serialNumber
      db.execute(sql`
        SELECT
          fingerprint_sha256 AS fingerprint,
          subject_org AS "subjectOrg",
          subject_cn AS "subjectCn",
          cert_type AS "certType",
          serial_number AS "serialNumber"
        FROM certificates
        WHERE (
          subject_org ILIKE ${pattern}
          OR subject_cn ILIKE ${pattern}
          OR LOWER(serial_number) LIKE ${pattern}
        )
        AND is_superseded = false
        ORDER BY not_before DESC
        LIMIT 5
      `),

      // Organizations: distinct org names with cert count
      db.execute(sql`
        SELECT subject_org AS org, COUNT(*)::int AS count
        FROM certificates
        WHERE subject_org ILIKE ${pattern}
          AND is_superseded = false
        GROUP BY subject_org
        ORDER BY count DESC
        LIMIT 5
      `),
    ]);

    return NextResponse.json(
      {
        domains: domainRows.rows,
        certificates: certRows.rows,
        orgs: orgRows.rows,
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT_BROWSER },
      },
    );
  } catch (err) {
    return apiError(err, "search.api.failed", "/api/search", "Failed to search");
  }
}
