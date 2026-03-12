import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { BimiDnsRow } from "./backfill-bimi-dns";
import type { DnsChangeRecord, DnsRefreshAdapter, OldDomainState } from "@/lib/dns/refresh-orchestrator";
import { refreshDnsBatch } from "@/lib/dns/refresh-orchestrator";

/**
 * CLI worker adapter — uses raw neon() SQL template tag with
 * transaction support for atomic change-insert + state-upsert.
 */
function createRawSqlAdapter(sql: NeonQueryFunction<false, false>): DnsRefreshAdapter {
  return {
    async fetchStalest(limit: number): Promise<OldDomainState[]> {
      return (await sql`
				SELECT domain, bimi_record_raw, dmarc_record_raw
				FROM domain_bimi_state
				ORDER BY last_checked ASC NULLS FIRST, created_at ASC
				LIMIT ${limit}
			`) as OldDomainState[];
    },

    async persistDomain(changes: DnsChangeRecord[], row: BimiDnsRow): Promise<void> {
      // Use a transaction so change records and state upsert are atomic
      await sql.transaction([
        // Insert any change records
        ...changes.map(
          (c) => sql`
						INSERT INTO dns_record_changes (domain, record_type, change_type, previous_raw, new_raw, previous_record, new_record)
						VALUES (
							${c.domain}, ${c.recordType}, ${c.changeType},
							${c.previousRaw}, ${c.newRaw},
							${c.previousRecord ? JSON.stringify(c.previousRecord) : null}::jsonb,
							${c.newRecord ? JSON.stringify(c.newRecord) : null}::jsonb
						)
					`,
        ),
        // Upsert domain_bimi_state
        sql`
					INSERT INTO domain_bimi_state (
						domain, bimi_record_raw, bimi_version, bimi_logo_url, bimi_authority_url,
						bimi_lps_tag, bimi_avp_tag, bimi_declination, bimi_selector, bimi_org_domain_fallback,
						dmarc_record_raw, dmarc_policy, dmarc_pct, dmarc_valid,
						svg_fetched, svg_content, svg_content_type, svg_size_bytes,
						svg_tiny_ps_valid, svg_validation_errors, svg_indicator_hash,
						dns_snapshot, last_checked
					) VALUES (
						${row.domain}, ${row.bimi_record_raw}, ${row.bimi_version},
						${row.bimi_logo_url}, ${row.bimi_authority_url},
						${row.bimi_lps_tag}, ${row.bimi_avp_tag}, ${row.bimi_declination},
						${row.bimi_selector}, ${row.bimi_org_domain_fallback},
						${row.dmarc_record_raw}, ${row.dmarc_policy}, ${row.dmarc_pct}, ${row.dmarc_valid},
						${row.svg_fetched}, ${row.svg_content}, ${row.svg_content_type}, ${row.svg_size_bytes},
						${row.svg_tiny_ps_valid}, ${row.svg_validation_errors}, ${row.svg_indicator_hash},
						${row.dns_snapshot ? JSON.stringify(row.dns_snapshot) : null}::jsonb, now()
					)
					ON CONFLICT (domain) DO UPDATE SET
						bimi_record_raw = EXCLUDED.bimi_record_raw,
						bimi_version = EXCLUDED.bimi_version,
						bimi_logo_url = EXCLUDED.bimi_logo_url,
						bimi_authority_url = EXCLUDED.bimi_authority_url,
						bimi_lps_tag = EXCLUDED.bimi_lps_tag,
						bimi_avp_tag = EXCLUDED.bimi_avp_tag,
						bimi_declination = EXCLUDED.bimi_declination,
						bimi_selector = EXCLUDED.bimi_selector,
						bimi_org_domain_fallback = EXCLUDED.bimi_org_domain_fallback,
						dmarc_record_raw = EXCLUDED.dmarc_record_raw,
						dmarc_policy = EXCLUDED.dmarc_policy,
						dmarc_pct = EXCLUDED.dmarc_pct,
						dmarc_valid = EXCLUDED.dmarc_valid,
						svg_fetched = EXCLUDED.svg_fetched,
						svg_content = EXCLUDED.svg_content,
						svg_content_type = EXCLUDED.svg_content_type,
						svg_size_bytes = EXCLUDED.svg_size_bytes,
						svg_tiny_ps_valid = EXCLUDED.svg_tiny_ps_valid,
						svg_validation_errors = EXCLUDED.svg_validation_errors,
						svg_indicator_hash = EXCLUDED.svg_indicator_hash,
						dns_snapshot = EXCLUDED.dns_snapshot,
						last_checked = now(),
						updated_at = now()
				`,
      ]);
    },
  };
}

export async function refreshDns(sql: NeonQueryFunction<false, false>, limit: number) {
  const adapter = createRawSqlAdapter(sql);
  return refreshDnsBatch(adapter, limit);
}
