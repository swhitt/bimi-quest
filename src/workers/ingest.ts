import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Raw sql template tag for utility modes (reparse, rescore, check, etc.)
const sql = neon(connectionString);

// Entry point — thin CLI dispatcher that delegates to per-mode modules
const mode = process.argv[2] || "backfill";
console.log(`BIMI Quest Ingestion Worker - Mode: ${mode}`);

if (mode === "stream") {
  const { stream } = await import("./modes/stream");
  stream().catch(console.error);
} else if (mode === "reparse") {
  const { reparse } = await import("./modes/reparse");
  reparse(sql).catch(console.error);
} else if (mode === "check") {
  const { checkIntegrity } = await import("./modes/check");
  checkIntegrity(sql).catch(console.error);
} else if (mode === "rescore") {
  const limit = parseInt(process.argv[3] || "0", 10);
  const { rescore } = await import("./modes/rescore");
  rescore(sql, limit).catch(console.error);
} else if (mode === "backfill-industry") {
  const { backfillIndustry } = await import("./modes/backfill-industry");
  backfillIndustry(sql).catch(console.error);
} else if (mode === "backfill-color-richness") {
  const recalc = process.argv[3] === "recalc";
  const { backfillColorRichness } = await import("./modes/backfill-color-richness");
  backfillColorRichness(sql, recalc).catch(console.error);
} else if (mode === "backfill-tile-bg") {
  const recalc = process.argv[3] === "recalc";
  const { backfillTileBg } = await import("./modes/backfill-tile-bg");
  backfillTileBg(sql, recalc).catch(console.error);
} else if (mode === "backfill-visual-hash") {
  const recalc = process.argv[3] === "recalc";
  const { backfillVisualHash } = await import("./modes/backfill-visual-hash");
  backfillVisualHash(sql, recalc).catch(console.error);
} else if (mode === "score-logos") {
  // score-logos [limit]              — backfill unscored logos
  // score-logos recalc [offset]      — re-score all, optionally resume from offset
  const arg3 = process.argv[3] || "";
  const recalc = arg3 === "recalc";
  const limit = recalc ? 0 : parseInt(arg3, 10) || 0;
  const resumeOffset = recalc ? parseInt(process.argv[4] || "0", 10) || 0 : 0;
  const { scoreLogos } = await import("./modes/score-logos");
  scoreLogos(sql, limit, recalc, resumeOffset).catch(console.error);
} else if (mode === "reslug") {
  const { reslug } = await import("./modes/reslug");
  reslug(sql).catch(console.error);
} else if (mode === "bimi-dns") {
  const limit = parseInt(process.argv[3] || "1000", 10);
  const { backfillBimiDns } = await import("./modes/backfill-bimi-dns");
  backfillBimiDns(sql, limit).catch(console.error);
} else {
  const { backfill } = await import("./modes/backfill");
  backfill().catch(console.error);
}
