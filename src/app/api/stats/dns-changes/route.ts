import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { dnsRecordChanges } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));

  try {
    const rows = await db
      .select({
        domain: dnsRecordChanges.domain,
        recordType: dnsRecordChanges.recordType,
        changeType: dnsRecordChanges.changeType,
        previousRaw: dnsRecordChanges.previousRaw,
        newRaw: dnsRecordChanges.newRaw,
        previousRecord: dnsRecordChanges.previousRecord,
        newRecord: dnsRecordChanges.newRecord,
        detectedAt: dnsRecordChanges.detectedAt,
      })
      .from(dnsRecordChanges)
      .orderBy(desc(dnsRecordChanges.detectedAt))
      .limit(limit);

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          domain: r.domain,
          recordType: r.recordType,
          changeType: r.changeType,
          previousRecord: r.previousRecord,
          newRecord: r.newRecord,
          detectedAt: r.detectedAt?.toISOString() ?? null,
        })),
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch (error) {
    return apiError(error, "dmarc-drift.api.failed", "/api/stats/dmarc-drift", "Failed to fetch DNS record changes");
  }
}
