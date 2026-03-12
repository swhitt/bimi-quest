import type { NeonQueryFunction } from "@neondatabase/serverless";
import { computeColorRichness } from "@/lib/svg-color-richness";
import { batchUpdateColorRichness } from "../batch-update";
import { backfillSvgProperty } from "./backfill-svg-property";

export async function backfillColorRichness(sql: NeonQueryFunction<false, false>, recalc = false) {
  await backfillSvgProperty<number>(sql, {
    label: "color richness scores",
    targetColumn: "logo_color_richness",
    recalc,
    compute: (svg) => computeColorRichness(svg),
    batchUpdate: async (sql, updates) => {
      await batchUpdateColorRichness(
        sql,
        updates.map((u) => ({ hash: u.hash, score: u.value })),
      );
    },
  });
}
