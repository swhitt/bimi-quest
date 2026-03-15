/**
 * Batch UPDATE helpers for worker modes.
 *
 * Uses a shared `chunkedExecute` to avoid repeating chunk-iterate boilerplate.
 * Each public function provides its specific SQL template to the generic helper.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

async function chunkedExecute<T>(
  sql: NeonQueryFunction<false, false>,
  rows: T[],
  chunkSize: number,
  buildQuery: (sql: NeonQueryFunction<false, false>, chunk: T[]) => ReturnType<NeonQueryFunction<false, false>>,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await buildQuery(sql, rows.slice(i, i + chunkSize));
  }
}

/**
 * Batch-update notability scores by certificate ID.
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
  await chunkedExecute(sql, rows, 200, (sql, chunk) => {
    const ids = chunk.map((r) => r.id);
    const scores = chunk.map((r) => r.notabilityScore);
    const reasons = chunk.map((r) => r.notabilityReason);
    const descriptions = chunk.map((r) => r.companyDescription);
    const industries = chunk.map((r) => r.industry);

    return sql`
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
  });
}

/**
 * Batch-update industry classification by certificate ID.
 */
export async function batchUpdateIndustry(
  sql: NeonQueryFunction<false, false>,
  rows: { id: number; industry: string }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const ids = chunk.map((r) => r.id);
    const industries = chunk.map((r) => r.industry);

    return sql`
			UPDATE certificates AS c SET industry = d.industry
			FROM unnest(${ids}::int[], ${industries}::text[]) AS d(id, industry)
			WHERE c.id = d.id
		`;
  });
}

/**
 * Batch-update color richness scores by SVG hash.
 */
export async function batchUpdateColorRichness(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; score: number }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const hashes = chunk.map((r) => r.hash);
    const scores = chunk.map((r) => r.score);

    return sql`
			UPDATE logos SET color_richness = d.score
			FROM unnest(${hashes}::text[], ${scores}::int[]) AS d(hash, score)
			WHERE logos.svg_hash = d.hash
		`;
  });
}

/**
 * Batch-update visual hashes by SVG hash.
 */
export async function batchUpdateVisualHash(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; visualHash: string }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const hashes = chunk.map((r) => r.hash);
    const visualHashes = chunk.map((r) => r.visualHash);

    return sql`
			UPDATE logos SET visual_hash = d.visual_hash
			FROM unnest(${hashes}::text[], ${visualHashes}::text[]) AS d(hash, visual_hash)
			WHERE logos.svg_hash = d.hash
		`;
  });
}

/**
 * Batch-update tile background hint by SVG hash (logos table).
 */
export async function batchUpdateTileBg(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; bg: string }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const hashes = chunk.map((r) => r.hash);
    const bgs = chunk.map((r) => r.bg);

    return sql`
			UPDATE logos SET tile_bg = d.bg
			FROM unnest(${hashes}::text[], ${bgs}::text[]) AS d(hash, bg)
			WHERE logos.svg_hash = d.hash
		`;
  });
}

/**
 * Batch-update logo quality scores by SVG hash.
 */
export async function batchUpdateLogoQuality(
  sql: NeonQueryFunction<false, false>,
  rows: { hash: string; score: number; reason: string | null }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const hashes = chunk.map((r) => r.hash);
    const scores = chunk.map((r) => r.score);
    const reasons = chunk.map((r) => r.reason);

    return sql`
			UPDATE logos SET
				quality_score = d.score,
				quality_reason = d.reason
			FROM unnest(${hashes}::text[], ${scores}::int[], ${reasons}::text[]) AS d(hash, score, reason)
			WHERE logos.svg_hash = d.hash
		`;
  });
}

/**
 * Batch-update tile background hint by domain (domain_bimi_state table).
 */
export async function batchUpdateDomainTileBg(
  sql: NeonQueryFunction<false, false>,
  rows: { domain: string; bg: string }[],
): Promise<void> {
  await chunkedExecute(sql, rows, 500, (sql, chunk) => {
    const domains = chunk.map((r) => r.domain);
    const bgs = chunk.map((r) => r.bg);

    return sql`
			UPDATE domain_bimi_state AS d SET svg_tile_bg = u.bg
			FROM unnest(${domains}::text[], ${bgs}::text[]) AS u(domain, bg)
			WHERE d.domain = u.domain
		`;
  });
}
