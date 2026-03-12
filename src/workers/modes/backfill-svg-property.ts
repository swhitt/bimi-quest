import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SvgGroupRow } from "../types";

/**
 * Standard cursor-based SVG batch query. Handles both recalc (all SVGs)
 * and non-recalc (only rows where targetColumn IS NULL) modes.
 */
function defaultFetchBatch(targetColumn: string) {
  return async (sql: NeonQueryFunction<false, false>, lastHash: string, limit: number, recalc: boolean) => {
    if (recalc) {
      return (await sql`
				SELECT logotype_svg_hash as hash, (array_agg(logotype_svg))[1] as svg
				FROM certificates
				WHERE logotype_svg IS NOT NULL AND logotype_svg_hash > ${lastHash}
				GROUP BY logotype_svg_hash ORDER BY logotype_svg_hash LIMIT ${limit}
			`) as SvgGroupRow[];
    }
    return (await sql`
			SELECT logotype_svg_hash as hash, (array_agg(logotype_svg))[1] as svg
			FROM certificates
			WHERE logotype_svg IS NOT NULL AND ${sql.unsafe(targetColumn)} IS NULL
				AND logotype_svg_hash > ${lastHash}
			GROUP BY logotype_svg_hash ORDER BY logotype_svg_hash LIMIT ${limit}
		`) as SvgGroupRow[];
  };
}

/**
 * Generic backfill loop for computing a property from SVG content.
 * All 3 SVG backfill modes (visual-hash, color-richness, tile-bg) share
 * the same cursor-based pagination and batch-update pattern.
 */
export async function backfillSvgProperty<T>(
  sql: NeonQueryFunction<false, false>,
  opts: {
    label: string;
    targetColumn: string;
    recalc?: boolean;
    compute: (svg: string) => T | Promise<T>;
    batchUpdate: (sql: NeonQueryFunction<false, false>, updates: { hash: string; value: T }[]) => Promise<void>;
  },
) {
  const mode = opts.recalc ? "Re-computing all" : "Backfilling uncomputed";
  console.log(`${mode} ${opts.label}...\n`);

  const fetchBatch = defaultFetchBatch(opts.targetColumn);
  const BATCH = 100;
  let processed = 0;
  let lastHash = "";

  while (true) {
    const rows = await fetchBatch(sql, lastHash, BATCH, opts.recalc ?? false);
    if (rows.length === 0) break;

    const updates: { hash: string; value: T }[] = [];

    for (const row of rows) {
      const value = await opts.compute(row.svg);
      if (value !== null && value !== undefined) {
        updates.push({ hash: row.hash, value });
      }
      lastHash = row.hash;
      processed++;
    }

    await opts.batchUpdate(sql, updates);

    if (processed % 100 === 0) {
      process.stdout.write(`\r  Processed ${processed} unique SVGs...`);
    }
  }

  console.log(`\nDone. Processed ${processed} unique SVGs.`);
}
