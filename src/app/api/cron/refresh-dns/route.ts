import { asc, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, verifyCronAuth } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { dnsRecordChanges, domainBimiState } from "@/lib/db/schema";
import type { BimiDnsRow } from "@/workers/modes/backfill-bimi-dns";
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

    async persistDomain(changes: DnsChangeRecord[], row: BimiDnsRow): Promise<void> {
      await db.transaction(async (tx) => {
        // Insert change records
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

        // Upsert domain_bimi_state
        await tx
          .insert(domainBimiState)
          .values({
            domain: row.domain,
            bimiRecordRaw: row.bimi_record_raw,
            bimiVersion: row.bimi_version,
            bimiLogoUrl: row.bimi_logo_url,
            bimiAuthorityUrl: row.bimi_authority_url,
            bimiLpsTag: row.bimi_lps_tag,
            bimiAvpTag: row.bimi_avp_tag,
            bimiDeclination: row.bimi_declination,
            bimiSelector: row.bimi_selector,
            bimiOrgDomainFallback: row.bimi_org_domain_fallback,
            dmarcRecordRaw: row.dmarc_record_raw,
            dmarcPolicy: row.dmarc_policy,
            dmarcPct: row.dmarc_pct,
            dmarcValid: row.dmarc_valid,
            svgFetched: row.svg_fetched,
            svgContent: row.svg_content,
            svgContentType: row.svg_content_type,
            svgSizeBytes: row.svg_size_bytes,
            svgTinyPsValid: row.svg_tiny_ps_valid,
            svgValidationErrors: row.svg_validation_errors,
            svgIndicatorHash: row.svg_indicator_hash,
            dnsSnapshot: row.dns_snapshot,
            lastChecked: new Date(),
          })
          .onConflictDoUpdate({
            target: domainBimiState.domain,
            set: {
              bimiRecordRaw: row.bimi_record_raw,
              bimiVersion: row.bimi_version,
              bimiLogoUrl: row.bimi_logo_url,
              bimiAuthorityUrl: row.bimi_authority_url,
              bimiLpsTag: row.bimi_lps_tag,
              bimiAvpTag: row.bimi_avp_tag,
              bimiDeclination: row.bimi_declination,
              bimiSelector: row.bimi_selector,
              bimiOrgDomainFallback: row.bimi_org_domain_fallback,
              dmarcRecordRaw: row.dmarc_record_raw,
              dmarcPolicy: row.dmarc_policy,
              dmarcPct: row.dmarc_pct,
              dmarcValid: row.dmarc_valid,
              svgFetched: row.svg_fetched,
              svgContent: row.svg_content,
              svgContentType: row.svg_content_type,
              svgSizeBytes: row.svg_size_bytes,
              svgTinyPsValid: row.svg_tiny_ps_valid,
              svgValidationErrors: row.svg_validation_errors,
              svgIndicatorHash: row.svg_indicator_hash,
              dnsSnapshot: row.dns_snapshot,
              lastChecked: new Date(),
              updatedAt: new Date(),
            },
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
