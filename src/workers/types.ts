/**
 * Type definitions for raw SQL result shapes used across worker modes.
 * Centralizes inline `as { ... }` casts into named interfaces.
 */

import type { BrandInput } from "@/lib/notability";

// ── Integrity check (check mode) ────────────────────────────────────

export interface CertStatsRow {
  total_certs: string;
  min_index: string;
  max_index: string;
}

export interface GapRow {
  gap: string;
  occurrences: string;
}

export interface CountRow {
  cnt: string;
}

// ── Reparse mode ────────────────────────────────────────────────────

export interface ReparseRow {
  id: number;
  raw_pem: string;
  logotype_svg_hash: string | null;
  mark_type: string | null;
}

// ── Rescore / backfill-industry modes ───────────────────────────────

export interface BrandRow {
  id: number;
  subject_org: string | null;
  san_list: string[];
  subject_country: string | null;
}

// ── Score-logos mode ────────────────────────────────────────────────

export interface LogoGroupRow {
  hash: string;
  svg: string;
  label: string | null;
}

// ── Color richness / visual hash modes ──────────────────────────────

export interface SvgGroupRow {
  hash: string;
  svg: string;
}

export interface CountResult {
  count: string;
}

// ── SCT backfill mode ──────────────────────────────────────────────

export interface SctBackfillRow {
  id: number;
  not_before: string;
  extensions_json: Record<string, string | { v: string }> | null;
}

// ── Shared row-to-BrandInput mapper ─────────────────────────────────

/**
 * Convert a raw SQL brand row into a BrandInput for notability/industry scoring.
 * This is the canonical transformation used by rescore, backfill-industry,
 * and the ingest-batch flushScores function.
 */
export function rowToBrandInput(row: BrandRow): BrandInput {
  return {
    id: String(row.id),
    org: row.subject_org || "",
    domain: row.san_list?.[0] || "unknown",
    country: row.subject_country || "unknown",
  };
}
