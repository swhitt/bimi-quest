import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.execute<{ provider: string; domainCount: number }>(sql`
      SELECT
        LOWER(TRIM(SUBSTRING(addr FROM POSITION('@' IN addr) + 1))) AS "provider",
        COUNT(DISTINCT dbs.domain)::int AS "domainCount"
      FROM domain_bimi_state dbs,
      LATERAL regexp_split_to_table(dbs.dmarc_record_raw, ',') AS part,
      LATERAL (
        SELECT TRIM(SUBSTRING(part FROM 'mailto:([^;,!\\s]+)')) AS addr
      ) extracted
      WHERE dbs.dmarc_record_raw IS NOT NULL
        AND addr IS NOT NULL
        AND addr LIKE '%@%'
      GROUP BY "provider"
      ORDER BY "domainCount" DESC
      LIMIT 50
    `);

    return NextResponse.json({ data: result.rows }, { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM } });
  } catch (error) {
    return apiError(
      error,
      "rua-providers.api.failed",
      "/api/stats/rua-providers",
      "Failed to fetch RUA provider breakdown",
    );
  }
}
