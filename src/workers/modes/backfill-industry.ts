import type { NeonQueryFunction } from "@neondatabase/serverless";
import { throttle } from "@/lib/ct/gorgon";
import { classifyIndustryBatch } from "@/lib/notability";
import { batchUpdateIndustry } from "../batch-update";
import { type BrandRow, rowToBrandInput } from "../types";

/**
 * Backfill industry for certs that were scored but have no industry.
 * Uses a lightweight industry-only classifier (cheaper than full rescore).
 */
export async function backfillIndustry(sql: NeonQueryFunction<false, false>) {
  console.log("Backfilling industry for certs with industry IS NULL...\n");

  const BATCH = 50;
  let classified = 0;
  let unchangedIterations = 0;

  while (true) {
    const prevClassified = classified;

    const rows = (await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE industry IS NULL AND subject_org IS NOT NULL
      ORDER BY id DESC
      LIMIT ${BATCH}
    `) as BrandRow[];
    if (rows.length === 0) break;

    const brands = rows.map(rowToBrandInput).filter((b) => b.org);
    const results = await classifyIndustryBatch(brands);

    // Collect updates for bulk SQL
    const updates: { id: number; industry: string }[] = [];

    for (const row of rows) {
      const industry = results.get(String(row.id));
      if (industry) {
        updates.push({ id: row.id, industry });
        classified++;
        const name = row.subject_org || row.san_list?.[0] || "unknown";
        console.log(`  ${classified}: ${name} -> ${industry}`);
      }
    }

    await batchUpdateIndustry(sql, updates);

    if (classified === prevClassified) {
      unchangedIterations++;
      if (unchangedIterations >= 3) {
        console.warn("No progress after 3 iterations, stopping.");
        break;
      }
    } else {
      unchangedIterations = 0;
    }

    await throttle(100);
  }

  console.log(`\nBackfill complete. Classified ${classified} certificates.`);
}
