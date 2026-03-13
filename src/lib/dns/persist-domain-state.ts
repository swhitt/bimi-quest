/**
 * Shared domain_bimi_state upsert helpers — used by both raw SQL (worker)
 * and Drizzle (cron) callers. The field mapping lives in one place
 * (DOMAIN_STATE_FIELDS + buildDomainStateValues) so adding a column
 * only requires a single change.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { BimiDnsRow } from "@/workers/modes/backfill-bimi-dns";

/**
 * Canonical field mapping: [snake_case DB column, camelCase BimiDnsRow key].
 * Order must match between INSERT columns and VALUES.
 */
export const DOMAIN_STATE_FIELDS: readonly [string, keyof BimiDnsRow][] = [
  ["domain", "domain"],
  ["bimi_record_raw", "bimi_record_raw"],
  ["bimi_version", "bimi_version"],
  ["bimi_logo_url", "bimi_logo_url"],
  ["bimi_authority_url", "bimi_authority_url"],
  ["bimi_lps_tag", "bimi_lps_tag"],
  ["bimi_avp_tag", "bimi_avp_tag"],
  ["bimi_declination", "bimi_declination"],
  ["bimi_selector", "bimi_selector"],
  ["bimi_org_domain_fallback", "bimi_org_domain_fallback"],
  ["bimi_record_count", "bimi_record_count"],
  ["dmarc_record_count", "dmarc_record_count"],
  ["dmarc_record_raw", "dmarc_record_raw"],
  ["dmarc_policy", "dmarc_policy"],
  ["dmarc_pct", "dmarc_pct"],
  ["dmarc_valid", "dmarc_valid"],
  ["svg_fetched", "svg_fetched"],
  ["svg_content", "svg_content"],
  ["svg_content_type", "svg_content_type"],
  ["svg_size_bytes", "svg_size_bytes"],
  ["svg_tiny_ps_valid", "svg_tiny_ps_valid"],
  ["svg_validation_errors", "svg_validation_errors"],
  ["svg_indicator_hash", "svg_indicator_hash"],
  ["svg_tile_bg", "svg_tile_bg"],
  ["dns_snapshot", "dns_snapshot"],
] as const;

/**
 * Build the Drizzle-compatible field object from a BimiDnsRow.
 * Used by the cron route's Drizzle adapter. The typed return keeps Drizzle
 * happy; the test suite verifies these keys stay in sync with DOMAIN_STATE_FIELDS.
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
    bimiRecordCount: row.bimi_record_count,
    dmarcRecordCount: row.dmarc_record_count,
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
 * Derives columns and values from the same DOMAIN_STATE_FIELDS constant
 * used by buildDomainStateValues, so adding a field only requires one change.
 */
export function upsertDomainStateSql(sql: NeonQueryFunction<false, false>, row: BimiDnsRow) {
  const columns = DOMAIN_STATE_FIELDS.map(([snake]) => snake);
  const values = DOMAIN_STATE_FIELDS.map(([, key]) => {
    const v = row[key];
    // dns_snapshot needs JSON serialization for the jsonb column
    if (key === "dns_snapshot") return v ? JSON.stringify(v) : null;
    return v;
  });
  const updateClauses = columns.filter((col) => col !== "domain").map((col) => `${col} = EXCLUDED.${col}`);

  const columnList = [...columns, "last_checked"].join(", ");
  const updateSet = [...updateClauses, "last_checked = now()", "updated_at = now()"].join(", ");

  // Build parameterized placeholders: $1, $2, ..., $N, now()
  const placeholders = values.map((_, i) => `$${i + 1}`);
  // dns_snapshot needs a ::jsonb cast (it's the last field before last_checked)
  const snapshotIdx = columns.indexOf("dns_snapshot");
  if (snapshotIdx >= 0) placeholders[snapshotIdx] += "::jsonb";
  const valueList = [...placeholders, "now()"].join(", ");

  const query = `
    INSERT INTO domain_bimi_state (${columnList})
    VALUES (${valueList})
    ON CONFLICT (domain) DO UPDATE SET ${updateSet}
  `;

  return sql.query(query, values as unknown[]);
}
