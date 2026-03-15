import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isLightBg, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";
import { batchUpdateTileBg } from "../batch-update";
import { backfillSvgProperty } from "./backfill-svg-property";

export async function backfillTileBg(sql: NeonQueryFunction<false, false>, recalc = false) {
  await backfillSvgProperty<string>(sql, {
    label: "tile background hints",
    targetColumn: "tile_bg",
    recalc,
    compute: (svg) => {
      const stripped = stripWhiteSvgBg(svg);
      const bgColor = tileBgForSvg(stripped);
      return isLightBg(bgColor) ? "light" : "dark";
    },
    batchUpdate: async (sql, updates) => {
      await batchUpdateTileBg(
        sql,
        updates.map((u) => ({ hash: u.hash, bg: u.value })),
      );
    },
  });
}
