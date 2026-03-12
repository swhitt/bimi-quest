import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { dnsRecordChanges } from "@/lib/db/schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain: rawDomain } = await params;
  const domain = decodeURIComponent(rawDomain).toLowerCase().replace(/\.$/, "");
  const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));

  try {
    const rows = await db
      .select({
        domain: dnsRecordChanges.domain,
        recordType: dnsRecordChanges.recordType,
        changeType: dnsRecordChanges.changeType,
        previousRecord: dnsRecordChanges.previousRecord,
        newRecord: dnsRecordChanges.newRecord,
        detectedAt: dnsRecordChanges.detectedAt,
      })
      .from(dnsRecordChanges)
      .where(and(eq(dnsRecordChanges.domain, domain)))
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
    return apiError(
      error,
      "domain-changes.api.failed",
      `/api/domains/${domain}/changes`,
      "Failed to fetch domain DNS changes",
    );
  }
}
