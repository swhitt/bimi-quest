import type { NeonQueryFunction } from "@neondatabase/serverless";
import { throttle } from "@/lib/ct/gorgon";
import { scoreNotabilityBatch } from "@/lib/notability";
import { errorMessage } from "@/lib/utils";
import { batchUpdateScores } from "../batch-update";
import { type BrandRow, rowToBrandInput } from "../types";

/**
 * Score notability for all certs that don't have a score yet.
 * Uses Claude Haiku to assess brand recognition.
 */
export async function rescore(sql: NeonQueryFunction<false, false>, maxCerts = 0) {
  const label = maxCerts > 0 ? `newest ${maxCerts}` : "all";
  console.log(`Scoring notability for ${label} unscored certificates...\n`);

  const DB_BATCH = 50;
  const SCORE_BATCH = 10;
  let scored = 0;

  while (true) {
    if (maxCerts > 0 && scored >= maxCerts) break;

    // No OFFSET needed — scored rows drop out of the NULL filter each iteration
    const rows = (await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE notability_score IS NULL
      ORDER BY id DESC
      LIMIT ${DB_BATCH}
    `) as BrandRow[];
    if (rows.length === 0) break;

    // Process in batches of SCORE_BATCH for efficient Haiku calls
    for (let i = 0; i < rows.length; i += SCORE_BATCH) {
      if (maxCerts > 0 && scored >= maxCerts) break;

      try {
        const remaining = maxCerts > 0 ? maxCerts - scored : SCORE_BATCH;
        const chunk = rows.slice(i, i + Math.min(SCORE_BATCH, remaining));

        // Score certs without an org as 0 so they don't block the loop
        const noOrgRows = chunk.filter((r) => !r.subject_org);
        if (noOrgRows.length > 0) {
          for (const r of noOrgRows) {
            await sql`UPDATE certificates SET notability_score = 0, notability_reason = 'no org' WHERE id = ${r.id}`;
          }
          scored += noOrgRows.length;
        }

        const brands = chunk.map(rowToBrandInput).filter((b) => b.org);
        const results = await scoreNotabilityBatch(brands);

        // Collect updates for bulk SQL
        const updates: {
          id: number;
          notabilityScore: number;
          notabilityReason: string;
          companyDescription: string;
          industry: string;
        }[] = [];

        for (const row of chunk) {
          const result = results.get(String(row.id));
          if (result) {
            updates.push({
              id: row.id,
              notabilityScore: result.score,
              notabilityReason: result.reason,
              companyDescription: result.description,
              industry: result.industry,
            });
            scored++;
            const name = row.subject_org || row.san_list?.[0] || "unknown";
            console.log(`  Scored ${scored}: ${name} = ${result.score}/10`);
          }
        }

        await batchUpdateScores(sql, updates);
      } catch (err) {
        console.error(`  Scoring batch failed at offset ${i} (scored ${scored} so far): ${errorMessage(err)}`);
        continue;
      }
      await throttle(100);
    }
  }

  console.log(`\n\nRescore complete. Scored ${scored} certificates.`);
}
