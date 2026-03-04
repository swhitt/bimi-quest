/**
 * Batch UPDATE helpers for worker modes.
 *
 * Replaces per-row UPDATE loops with bulk SQL using Postgres unnest()
 * for parameter binding. Each function handles a specific update pattern
 * that appears across multiple worker modes.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Batch-update notability scores by certificate ID.
 * Used by the rescore worker mode.
 */
export async function batchUpdateScores(
  sql: NeonQueryFunction<false, false>,
  rows: {
    id: number;
    notabilityScore: number;
    notabilityReason: string;
    companyDescription: string;
    industry: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const ids = chunk.map((r) => r.id);
    const scores = chunk.map((r) => r.notabilityScore);
    const reasons = chunk.map((r) => r.notabilityReason);
    const descriptions = chunk.map((r) => r.companyDescription);
    const industries = chunk.map((r) => r.industry);

    await sql`
      UPDATE certificates AS c SET
        notability_score = d.score,
        notability_reason = d.reason,
        company_description = d.description,
        industry = d.industry
      FROM unnest(
        ${ids}::int[],
        ${scores}::int[],
        ${reasons}::text[],
        ${descriptions}::text[],
        ${industries}::text[]
      ) AS d(id, score, reason, description, industry)
      WHERE c.id = d.id
    `;
  }
}

/**
 * Batch-update industry classification by certificate ID.
 * Used by the backfill-industry worker mode.
 */
export async function batchUpdateIndustry(
  sql: NeonQueryFunction<false, false>,
  rows: { id: number; industry: string }[],
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const ids = chunk.map((r) => r.id);
    const industries = chunk.map((r) => r.industry);

    await sql`
      UPDATE certificates AS c SET industry = d.industry
      FROM unnest(${ids}::int[], ${industries}::text[]) AS d(id, industry)
      WHERE c.id = d.id
    `;
  }
}

/**
 * Batch-update color richness scores by SVG hash.
 * Used by the backfill-color-richness worker mode.
 */
export async function batchUpdateColorRichness(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; score: number }[],
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const hashes = chunk.map((r) => r.hash);
    const scores = chunk.map((r) => r.score);

    await sql`
      UPDATE certificates AS c SET logo_color_richness = d.score
      FROM unnest(${hashes}::text[], ${scores}::int[]) AS d(hash, score)
      WHERE c.logotype_svg_hash = d.hash
    `;
  }
}

/**
 * Batch-update visual hashes by SVG hash.
 * Used by the backfill-visual-hash worker mode.
 */
export async function batchUpdateVisualHash(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; visualHash: string }[],
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const hashes = chunk.map((r) => r.hash);
    const visualHashes = chunk.map((r) => r.visualHash);

    await sql`
      UPDATE certificates AS c SET logotype_visual_hash = d.visual_hash
      FROM unnest(${hashes}::text[], ${visualHashes}::text[]) AS d(hash, visual_hash)
      WHERE c.logotype_svg_hash = d.hash
    `;
  }
}

/**
 * Batch-update logo quality scores by SVG hash.
 * Used by the score-logos worker mode.
 */
export async function batchUpdateLogoQuality(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; score: number; reason: string | null }[],
): Promise<void> {
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const hashes = chunk.map((r) => r.hash);
    const scores = chunk.map((r) => r.score);
    const reasons = chunk.map((r) => r.reason);

    await sql`
      UPDATE certificates AS c SET
        logo_quality_score = d.score,
        logo_quality_reason = d.reason
      FROM unnest(${hashes}::text[], ${scores}::int[], ${reasons}::text[]) AS d(hash, score, reason)
      WHERE c.logotype_svg_hash = d.hash
    `;
  }
}
