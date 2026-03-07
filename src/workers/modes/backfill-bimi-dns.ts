import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isDMARCValidForBIMI, lookupDMARC } from "@/lib/bimi/dmarc";
import { lookupBIMIRecord } from "@/lib/bimi/dns";
import { computeSvgHash, decompressSvgIfNeeded, validateSVGTinyPS } from "@/lib/bimi/svg";
import { throttle } from "@/lib/ct/gorgon";
import { safeFetch } from "@/lib/net/safe-fetch";

interface BimiDnsRow {
  domain: string;
  bimi_record_raw: string | null;
  bimi_version: string | null;
  bimi_logo_url: string | null;
  bimi_authority_url: string | null;
  bimi_lps_tag: string | null;
  bimi_avp_tag: string | null;
  bimi_declination: boolean;
  bimi_selector: string;
  bimi_org_domain_fallback: boolean;
  dmarc_record_raw: string | null;
  dmarc_policy: string | null;
  dmarc_pct: number | null;
  dmarc_valid: boolean | null;
  svg_fetched: boolean;
  svg_content: string | null;
  svg_content_type: string | null;
  svg_size_bytes: number | null;
  svg_tiny_ps_valid: boolean | null;
  svg_validation_errors: string[] | null;
  svg_indicator_hash: string | null;
}

async function lookupDomain(domain: string): Promise<BimiDnsRow> {
  const row: BimiDnsRow = {
    domain,
    bimi_record_raw: null,
    bimi_version: null,
    bimi_logo_url: null,
    bimi_authority_url: null,
    bimi_lps_tag: null,
    bimi_avp_tag: null,
    bimi_declination: false,
    bimi_selector: "default",
    bimi_org_domain_fallback: false,
    dmarc_record_raw: null,
    dmarc_policy: null,
    dmarc_pct: null,
    dmarc_valid: null,
    svg_fetched: false,
    svg_content: null,
    svg_content_type: null,
    svg_size_bytes: null,
    svg_tiny_ps_valid: null,
    svg_validation_errors: null,
    svg_indicator_hash: null,
  };

  // Parallel DNS lookups
  const [bimiRecord, dmarcResult] = await Promise.all([
    lookupBIMIRecord(domain).catch(() => null),
    lookupDMARC(domain).catch(() => null),
  ]);

  if (bimiRecord) {
    row.bimi_record_raw = bimiRecord.raw;
    row.bimi_version = bimiRecord.version;
    row.bimi_logo_url = bimiRecord.logoUrl;
    row.bimi_authority_url = bimiRecord.authorityUrl;
    row.bimi_lps_tag = bimiRecord.lps;
    row.bimi_avp_tag = bimiRecord.avp;
    row.bimi_declination = bimiRecord.declined;
    row.bimi_selector = bimiRecord.selector;
    row.bimi_org_domain_fallback = bimiRecord.orgDomainFallback;
  }

  if (dmarcResult) {
    row.dmarc_record_raw = dmarcResult.record.raw;
    row.dmarc_policy = dmarcResult.record.policy;
    row.dmarc_pct = dmarcResult.record.pct;
    row.dmarc_valid = isDMARCValidForBIMI(dmarcResult.record, dmarcResult.isSubdomain);
  }

  if (bimiRecord?.logoUrl) {
    try {
      const res = await safeFetch(bimiRecord.logoUrl, {
        headers: { "User-Agent": "bimi-quest/1.0 (BIMI Validator)", Accept: "image/svg+xml" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        row.svg_content_type = res.headers.get("content-type");
        const buf = Buffer.from(await res.arrayBuffer());
        const svgText = decompressSvgIfNeeded(buf);
        if (svgText.includes("<svg") || svgText.includes("<SVG")) {
          row.svg_fetched = true;
          row.svg_content = svgText;
          row.svg_size_bytes = Buffer.byteLength(svgText, "utf8");
          row.svg_indicator_hash = computeSvgHash(svgText);
          const validation = validateSVGTinyPS(svgText);
          row.svg_tiny_ps_valid = validation.valid;
          row.svg_validation_errors = validation.errors.length > 0 ? validation.errors : null;
        }
      }
    } catch {
      // Fetch timeout or error — leave svg fields null
    }
  }

  return row;
}

/**
 * Backfill domain_bimi_state by extracting SAN domains from recent certificates
 * and performing BIMI DNS + SVG lookups.
 */
export async function backfillBimiDns(sql: NeonQueryFunction<false, false>, limit: number) {
  const desc = limit > 0 ? `${limit}` : "all";
  console.log(`Backfilling BIMI DNS state for ${desc} domains...\n`);

  // Extract distinct SAN domains from the most recent non-superseded certs,
  // excluding domains already in domain_bimi_state
  const domains = (await sql`
    WITH ranked_domains AS (
      SELECT DISTINCT ON (d) d AS domain, c.id AS cert_id
      FROM certificates c, unnest(c.san_list) AS d
      WHERE c.is_superseded = false
      ORDER BY d, c.id DESC
    )
    SELECT rd.domain
    FROM ranked_domains rd
    LEFT JOIN domain_bimi_state dbs ON dbs.domain = rd.domain
    WHERE dbs.id IS NULL
    ORDER BY rd.cert_id DESC
    ${limit > 0 ? sql`LIMIT ${limit}` : sql``}
  `) as { domain: string }[];

  console.log(`Found ${domains.length} new domains to check.\n`);
  if (domains.length === 0) return;

  const BATCH = 10; // DNS lookups are I/O-bound, keep concurrency moderate
  let processed = 0;
  let withBimi = 0;

  for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(async ({ domain }) => {
        try {
          return await lookupDomain(domain);
        } catch (err) {
          console.error(`  Error looking up ${domain}:`, err);
          return null;
        }
      }),
    );

    const rows = results.filter((r): r is BimiDnsRow => r !== null);
    if (rows.length === 0) continue;

    // Upsert into domain_bimi_state
    for (const row of rows) {
      await sql`
        INSERT INTO domain_bimi_state (
          domain, bimi_record_raw, bimi_version, bimi_logo_url, bimi_authority_url,
          bimi_lps_tag, bimi_avp_tag, bimi_declination, bimi_selector, bimi_org_domain_fallback,
          dmarc_record_raw, dmarc_policy, dmarc_pct, dmarc_valid,
          svg_fetched, svg_content, svg_content_type, svg_size_bytes,
          svg_tiny_ps_valid, svg_validation_errors, svg_indicator_hash,
          last_checked
        ) VALUES (
          ${row.domain}, ${row.bimi_record_raw}, ${row.bimi_version},
          ${row.bimi_logo_url}, ${row.bimi_authority_url},
          ${row.bimi_lps_tag}, ${row.bimi_avp_tag}, ${row.bimi_declination},
          ${row.bimi_selector}, ${row.bimi_org_domain_fallback},
          ${row.dmarc_record_raw}, ${row.dmarc_policy}, ${row.dmarc_pct}, ${row.dmarc_valid},
          ${row.svg_fetched}, ${row.svg_content}, ${row.svg_content_type}, ${row.svg_size_bytes},
          ${row.svg_tiny_ps_valid}, ${row.svg_validation_errors}, ${row.svg_indicator_hash},
          now()
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
          last_checked = now(),
          updated_at = now()
      `;
    }

    for (const row of rows) {
      processed++;
      const status = row.bimi_record_raw ? "BIMI" : "no-bimi";
      const dmarc = row.dmarc_valid ? "dmarc-ok" : "dmarc-fail";
      const svg = row.svg_fetched ? `svg-ok(${row.svg_size_bytes}b)` : "no-svg";
      if (row.bimi_record_raw) withBimi++;
      console.log(`  ${processed}/${domains.length}: ${row.domain} [${status} ${dmarc} ${svg}]`);
    }

    await throttle(50);
  }

  console.log(`\nBackfill complete. ${processed} domains processed, ${withBimi} with BIMI records.`);
}
