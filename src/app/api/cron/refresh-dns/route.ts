import { asc, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, verifyCronAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { dnsRecordChanges, domainBimiState } from "@/lib/db/schema";
import { buildDomainStateValues } from "@/lib/dns/persist-domain-state";
import type { DnsChangeRecord, DnsRefreshAdapter, OldDomainState } from "@/lib/dns/refresh-orchestrator";
import { refreshDnsBatch } from "@/lib/dns/refresh-orchestrator";

export const maxDuration = 300;

const LIMIT = 1000;

/** Drizzle adapter — uses db.transaction() for atomic persistence. */
function createDrizzleAdapter(): DnsRefreshAdapter {
  return {
    async fetchStalest(limit: number): Promise<OldDomainState[]> {
      const rows = await db
        .select({
          domain: domainBimiState.domain,
          bimi_record_raw: domainBimiState.bimiRecordRaw,
          dmarc_record_raw: domainBimiState.dmarcRecordRaw,
        })
        .from(domainBimiState)
        .orderBy(asc(sql`${domainBimiState.lastChecked} NULLS FIRST`), asc(domainBimiState.createdAt))
        .limit(limit);
      return rows;
    },

    async persistDomain(changes: DnsChangeRecord[], row): Promise<void> {
      const values = buildDomainStateValues(row);
      await db.transaction(async (tx) => {
        for (const c of changes) {
          await tx.insert(dnsRecordChanges).values({
            domain: c.domain,
            recordType: c.recordType,
            changeType: c.changeType,
            previousRaw: c.previousRaw,
            newRaw: c.newRaw,
            previousRecord: c.previousRecord,
            newRecord: c.newRecord,
          });
        }

        await tx
          .insert(domainBimiState)
          .values(values)
          .onConflictDoUpdate({
            target: domainBimiState.domain,
            set: { ...values, updatedAt: new Date() },
          });
      });
    },
  };
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const adapter = createDrizzleAdapter();
    const stats = await refreshDnsBatch(adapter, LIMIT);

    return NextResponse.json({
      status: "refreshed",
      ...stats,
    });
  } catch (error) {
    return apiError(error, "cron.refresh-dns.failed", "/api/cron/refresh-dns", "DNS refresh failed");
  }
}
