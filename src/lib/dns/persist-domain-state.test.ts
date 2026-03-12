import { describe, expect, it } from "vitest";
import { DOMAIN_STATE_FIELDS, buildDomainStateValues } from "./persist-domain-state";
import type { BimiDnsRow } from "@/workers/modes/backfill-bimi-dns";

/** snake_case -> camelCase, matching the conversion used in column name mapping */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** A complete BimiDnsRow fixture with non-null values for all fields */
function makeRow(): BimiDnsRow {
  return {
    domain: "example.com",
    bimi_record_raw: "v=BIMI1; l=https://example.com/logo.svg",
    bimi_version: "BIMI1",
    bimi_logo_url: "https://example.com/logo.svg",
    bimi_authority_url: "https://example.com/cert.pem",
    bimi_lps_tag: null,
    bimi_avp_tag: null,
    bimi_declination: false,
    bimi_selector: "default",
    bimi_org_domain_fallback: false,
    dmarc_record_raw: "v=DMARC1; p=reject",
    dmarc_policy: "reject",
    dmarc_pct: 100,
    dmarc_valid: true,
    svg_fetched: true,
    svg_content: "<svg>...</svg>",
    svg_content_type: "image/svg+xml",
    svg_size_bytes: 1234,
    svg_tiny_ps_valid: true,
    svg_validation_errors: null,
    svg_indicator_hash: "abc123",
    svg_tile_bg: "light",
    dns_snapshot: { version: 2, checkedAt: "2025-01-01T00:00:00Z" } as never,
  };
}

describe("persist-domain-state", () => {
  describe("DOMAIN_STATE_FIELDS covers all BimiDnsRow keys", () => {
    it("has an entry for every BimiDnsRow property", () => {
      const row = makeRow();
      const fieldKeys = new Set(DOMAIN_STATE_FIELDS.map(([, key]) => key));
      for (const key of Object.keys(row)) {
        expect(fieldKeys.has(key as keyof BimiDnsRow), `missing field: ${key}`).toBe(true);
      }
    });

    it("every field key is a valid BimiDnsRow property", () => {
      const row = makeRow();
      for (const [, key] of DOMAIN_STATE_FIELDS) {
        expect(key in row, `invalid field key: ${key}`).toBe(true);
      }
    });
  });

  describe("buildDomainStateValues consistency with DOMAIN_STATE_FIELDS", () => {
    it("produces a camelCase key for every DOMAIN_STATE_FIELDS entry", () => {
      const row = makeRow();
      const values = buildDomainStateValues(row);

      for (const [snake] of DOMAIN_STATE_FIELDS) {
        const camel = snakeToCamel(snake);
        expect(values, `missing camelCase key: ${camel}`).toHaveProperty(camel);
      }
    });

    it("maps the same BimiDnsRow values as DOMAIN_STATE_FIELDS references", () => {
      const row = makeRow();
      const values = buildDomainStateValues(row);

      for (const [snake, key] of DOMAIN_STATE_FIELDS) {
        const camel = snakeToCamel(snake);
        expect((values as Record<string, unknown>)[camel]).toEqual(row[key]);
      }
    });

    it("includes lastChecked as a Date", () => {
      const row = makeRow();
      const values = buildDomainStateValues(row);
      expect(values.lastChecked).toBeInstanceOf(Date);
    });

    it("has exactly DOMAIN_STATE_FIELDS.length + 1 keys (fields + lastChecked)", () => {
      const row = makeRow();
      const values = buildDomainStateValues(row);
      expect(Object.keys(values).length).toBe(DOMAIN_STATE_FIELDS.length + 1);
    });
  });

  describe("field count consistency", () => {
    it("DOMAIN_STATE_FIELDS has exactly 23 entries (22 data fields + domain)", () => {
      expect(DOMAIN_STATE_FIELDS.length).toBe(23);
    });
  });
});
