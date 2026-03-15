import type { NeonQueryFunction } from "@neondatabase/serverless";
import { computeVisualHash } from "@/lib/dhash";
import { batchUpdateVisualHash } from "../batch-update";
import { backfillSvgProperty } from "./backfill-svg-property";

export async function backfillVisualHash(sql: NeonQueryFunction<false, false>, recalc = false) {
  await backfillSvgProperty<string | null>(sql, {
    label: "visual hashes",
    targetColumn: "visual_hash",
    recalc,
    compute: (svg) => computeVisualHash(svg),
    batchUpdate: async (sql, updates) => {
      const rows = updates.filter((u): u is { hash: string; value: string } => u.value !== null);
      await batchUpdateVisualHash(
        sql,
        rows.map((u) => ({ hash: u.hash, visualHash: u.value })),
      );
    },
  });
}
