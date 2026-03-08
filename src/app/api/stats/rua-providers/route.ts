import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { domainBimiState } from "@/lib/db/schema";
import { isNotNull, sql } from "drizzle-orm";

export async function GET() {
  try {
    // Extract rua mailto: domains from DMARC records using SQL string functions.
    // The rua tag may contain multiple comma-separated mailto: URIs.
    // We use regexp_split_to_table to split on commas, then extract the domain
    // after the @ sign from each mailto: URI.
    const rows = await db
      .select({
        provider: sql<string>`provider`.as("provider"),
        domainCount: sql<number>`count(DISTINCT ${domainBimiState.domain})`.as("domain_count"),
      })
      .from(
        sql`(
          SELECT
            ${domainBimiState.domain},
            LOWER(TRIM(
              SUBSTRING(
                addr FROM POSITION('@' IN addr) + 1
              )
            )) AS provider
          FROM ${domainBimiState},
          LATERAL regexp_split_to_table(${domainBimiState.dmarcRecordRaw}, ',') AS part,
          LATERAL (
            SELECT TRIM(
              SUBSTRING(part FROM 'mailto:([^;,!\\s]+)')
            ) AS addr
          ) extracted
          WHERE ${isNotNull(domainBimiState.dmarcRecordRaw)}
            AND addr IS NOT NULL
            AND addr LIKE '%@%'
        ) sub`,
      )
      .groupBy(sql`provider`)
      .orderBy(sql`count(DISTINCT ${domainBimiState.domain}) DESC`)
      .limit(50);

    return NextResponse.json({ data: rows }, { headers: { "Cache-Control": CACHE_PRESETS.MEDIUM } });
  } catch (error) {
    return apiError(
      error,
      "rua-providers.api.failed",
      "/api/stats/rua-providers",
      "Failed to fetch RUA provider breakdown",
    );
  }
}
