import type { NeonQueryFunction } from "@neondatabase/serverless";
import { computeVisualHash } from "@/lib/dhash";
import { batchUpdateVisualHash } from "../batch-update";
import type { CountResult, SvgGroupRow } from "../types";

/**
 * Backfill perceptual visual hashes for existing SVGs.
 * Groups by logotype_svg_hash so each unique SVG is hashed once, then applied to all certs with that hash.
 */
export async function backfillVisualHash(sql: NeonQueryFunction<false, false>, recalc = false) {
  const mode = recalc ? "Re-hashing all" : "Backfilling unhashed";
  console.log(`${mode} visual hashes...\n`);

  const BATCH = 100;
  let hashed = 0;
  let lastHash = "";

  const [{ count: totalRemaining }] = (
    recalc
      ? await sql`SELECT COUNT(DISTINCT logotype_svg_hash) as count FROM certificates WHERE logotype_svg IS NOT NULL`
      : await sql`SELECT COUNT(DISTINCT logotype_svg_hash) as count FROM certificates WHERE logotype_svg IS NOT NULL AND logotype_visual_hash IS NULL`
  ) as CountResult[];
  console.log(`  ${totalRemaining} unique SVGs to hash\n`);

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
            AND logotype_visual_hash IS NULL
            AND logotype_svg_hash > ${lastHash}
          GROUP BY logotype_svg_hash
          ORDER BY logotype_svg_hash
          LIMIT ${BATCH}
        `
    ) as SvgGroupRow[];
    if (rows.length === 0) break;

    // Collect updates for bulk SQL
    const updates: { hash: string; visualHash: string }[] = [];

    for (const row of rows) {
      const visualHash = await computeVisualHash(row.svg);
      if (visualHash) {
        updates.push({ hash: row.hash, visualHash });
      }
      lastHash = row.hash;
      hashed++;
    }

    await batchUpdateVisualHash(sql, updates);

    if (hashed % 100 === 0) {
      process.stdout.write(`\r  Hashed ${hashed} / ${totalRemaining} unique SVGs...`);
    }
  }

  console.log(`\n${mode} complete. Hashed ${hashed} unique SVGs.`);
}
