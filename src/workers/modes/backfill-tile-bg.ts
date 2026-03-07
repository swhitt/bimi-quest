import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isLightBg, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";
import { batchUpdateTileBg } from "../batch-update";
import type { SvgGroupRow } from "../types";

/**
 * Backfill tile background hints for existing SVGs.
 * Groups by svg_hash so each unique SVG is computed once, then applied to all certs with that hash.
 */
export async function backfillTileBg(sql: NeonQueryFunction<false, false>, recalc = false) {
  const mode = recalc ? "Re-computing all" : "Backfilling uncomputed";
  console.log(`${mode} tile background hints...\n`);

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
            AND logo_tile_bg IS NULL
          GROUP BY logotype_svg_hash
          LIMIT ${BATCH}
        `
    ) as SvgGroupRow[];
    if (rows.length === 0) break;

    const updates: { hash: string; bg: string }[] = [];

    for (const row of rows) {
      const stripped = stripWhiteSvgBg(row.svg);
      const bgColor = tileBgForSvg(stripped);
      const bg = isLightBg(bgColor) ? "light" : "dark";
      updates.push({ hash: row.hash, bg });
      lastHash = row.hash;
      scored++;
    }

    await batchUpdateTileBg(sql, updates);

    if (scored % 100 === 0) {
      process.stdout.write(`\r  Computed ${scored} unique SVGs...`);
    }
  }

  console.log(`\n${mode} complete. Computed ${scored} unique SVGs.`);
}
