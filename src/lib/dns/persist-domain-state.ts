/**
 * Shared domain_bimi_state upsert helpers — used by both raw SQL (worker)
 * and Drizzle (cron) callers to avoid duplicating the 22-field mapping.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { BimiDnsRow } from "@/workers/modes/backfill-bimi-dns";

/**
 * Build the Drizzle-compatible field object from a BimiDnsRow.
 * Used by the cron route's Drizzle adapter.
 */
export function buildDomainStateValues(row: BimiDnsRow) {
  return {
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
    svgTileBg: row.svg_tile_bg,
    dnsSnapshot: row.dns_snapshot,
    lastChecked: new Date(),
  };
}

/**
 * Raw SQL upsert for domain_bimi_state — used by CLI workers.
 */
export function upsertDomainStateSql(sql: NeonQueryFunction<false, false>, row: BimiDnsRow) {
  return sql`
		INSERT INTO domain_bimi_state (
			domain, bimi_record_raw, bimi_version, bimi_logo_url, bimi_authority_url,
			bimi_lps_tag, bimi_avp_tag, bimi_declination, bimi_selector, bimi_org_domain_fallback,
			dmarc_record_raw, dmarc_policy, dmarc_pct, dmarc_valid,
			svg_fetched, svg_content, svg_content_type, svg_size_bytes,
			svg_tiny_ps_valid, svg_validation_errors, svg_indicator_hash, svg_tile_bg,
			dns_snapshot, last_checked
		) VALUES (
			${row.domain}, ${row.bimi_record_raw}, ${row.bimi_version},
			${row.bimi_logo_url}, ${row.bimi_authority_url},
			${row.bimi_lps_tag}, ${row.bimi_avp_tag}, ${row.bimi_declination},
			${row.bimi_selector}, ${row.bimi_org_domain_fallback},
			${row.dmarc_record_raw}, ${row.dmarc_policy}, ${row.dmarc_pct}, ${row.dmarc_valid},
			${row.svg_fetched}, ${row.svg_content}, ${row.svg_content_type}, ${row.svg_size_bytes},
			${row.svg_tiny_ps_valid}, ${row.svg_validation_errors}, ${row.svg_indicator_hash}, ${row.svg_tile_bg},
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
			svg_tile_bg = EXCLUDED.svg_tile_bg,
			dns_snapshot = EXCLUDED.dns_snapshot,
			last_checked = now(),
			updated_at = now()
	`;
}
