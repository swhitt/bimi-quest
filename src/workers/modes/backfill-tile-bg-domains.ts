import type { NeonQueryFunction } from "@neondatabase/serverless";
import { stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";
import { batchUpdateDomainTileBg } from "../batch-update";

export async function backfillTileBgDomains(sql: NeonQueryFunction<false, false>) {
  console.log("Backfilling svg_tile_bg for domain_bimi_state...\n");

  const rows = (await sql`
		SELECT domain, svg_content
		FROM domain_bimi_state
		WHERE svg_content IS NOT NULL AND svg_tile_bg IS NULL
		ORDER BY id
	`) as { domain: string; svg_content: string }[];

  console.log(`Found ${rows.length} domains to process.\n`);
  if (rows.length === 0) return;

  let processed = 0;
  const BATCH = 100;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    const updates = batch.map((row) => {
      const stripped = stripWhiteSvgBg(row.svg_content);
      const bg = tileBgForSvg(stripped);
      return { domain: row.domain, bg };
    });

    await batchUpdateDomainTileBg(sql, updates);

    processed += batch.length;
    console.log(`  ${processed}/${rows.length}`);
  }

  console.log(`\nDone. ${processed} domains updated.`);
}
