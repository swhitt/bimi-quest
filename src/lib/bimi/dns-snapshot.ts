import type { DnsSnapshot } from "@/lib/db/schema";

/**
 * Build a DnsSnapshot JSONB blob from structured DNS validation data.
 * Accepts nullable sub-objects so callers can pass whatever they have available.
 */
export function buildDnsSnapshot(params: {
  bimiRecord: {
    raw: string | null;
    version: string | null;
    logoUrl: string | null;
    authorityUrl: string | null;
    lps: string | null;
    avp: string | null;
    declined: boolean;
    selector: string;
    orgDomainFallback: boolean;
  } | null;
  dmarcRecord: {
    raw: string | null;
    policy: string | null;
    sp: string | null;
    pct: number | null;
    rua: string | null;
    ruf: string | null;
    adkim: string | null;
    aspf: string | null;
    validForBimi: boolean;
  } | null;
  svg: {
    found: boolean;
    sizeBytes: number | null;
    contentType: string | null;
    tinyPsValid: boolean | null;
    indicatorHash: string | null;
    validationErrors: string[] | null;
  } | null;
  certificate: {
    found: boolean;
    authorityUrl: string | null;
    certType: string | null;
    issuer: string | null;
  } | null;
  grade: string | null;
}): DnsSnapshot {
  return {
    bimi: params.bimiRecord,
    dmarc: params.dmarcRecord,
    svg: params.svg,
    certificate: params.certificate,
    meta: {
      checkedAt: new Date().toISOString(),
      grade: params.grade,
    },
  };
}
