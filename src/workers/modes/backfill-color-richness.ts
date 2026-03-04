import type { NeonQueryFunction } from "@neondatabase/serverless";
import { computeColorRichness } from "@/lib/svg-color-richness";
import { batchUpdateColorRichness } from "../batch-update";
import type { SvgGroupRow } from "../types";

/**
 * Backfill color richness scores for existing SVGs.
 * Groups by svg_hash so each unique SVG is scored once, then applied to all certs with that hash.
 */
export async function backfillColorRichness(sql: NeonQueryFunction<false, false>, recalc = false) {
  const mode = recalc ? "Re-scoring all" : "Backfilling unscored";
  console.log(`${mode} color richness scores...\n`);

  const BATCH = 100;
  let scored = 0;
  let lastHash = "";

  while (true) {
    const rows = (
      recalc
        ? await sql`
          SELECT logotype_svg_hash as hash,
            (array_agg(logotype_svg))[1] as svg
          FROM certificates
          WHERE logotype_svg IS NOT NULL
            AND logotype_svg_hash > ${lastHash}
          GROUP BY logotype_svg_hash
          ORDER BY logotype_svg_hash
          LIMIT ${BATCH}
        `
        : await sql`
          SELECT logotype_svg_hash as hash,
            (array_agg(logotype_svg))[1] as svg
          FROM certificates
          WHERE logotype_svg IS NOT NULL
            AND logo_color_richness IS NULL
          GROUP BY logotype_svg_hash
          LIMIT ${BATCH}
        `
    ) as SvgGroupRow[];
    if (rows.length === 0) break;

    // Collect all updates for bulk SQL
    const updates: { hash: string; score: number }[] = [];

    for (const row of rows) {
      const score = computeColorRichness(row.svg);
      updates.push({ hash: row.hash, score });
      lastHash = row.hash;
      scored++;
    }

    await batchUpdateColorRichness(sql, updates);

    if (scored % 100 === 0) {
      process.stdout.write(`\r  Scored ${scored} unique SVGs...`);
    }
  }

  console.log(`\n${mode} complete. Scored ${scored} unique SVGs.`);
}
