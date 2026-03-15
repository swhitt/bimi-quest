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
  stream().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "reparse") {
  const { reparse } = await import("./modes/reparse");
  reparse(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "check") {
  const { checkIntegrity } = await import("./modes/check");
  checkIntegrity(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "rescore") {
  const limit = parseInt(process.argv[3] || "0", 10);
  const { rescore } = await import("./modes/rescore");
  rescore(sql, limit).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-industry") {
  const { backfillIndustry } = await import("./modes/backfill-industry");
  backfillIndustry(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-color-richness") {
  const recalc = process.argv[3] === "recalc";
  const { backfillColorRichness } = await import("./modes/backfill-color-richness");
  backfillColorRichness(sql, recalc).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-tile-bg") {
  const recalc = process.argv[3] === "recalc";
  const { backfillTileBg } = await import("./modes/backfill-tile-bg");
  backfillTileBg(sql, recalc).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-visual-hash") {
  const recalc = process.argv[3] === "recalc";
  const { backfillVisualHash } = await import("./modes/backfill-visual-hash");
  backfillVisualHash(sql, recalc).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "score-logos") {
  // score-logos [limit]              — backfill unscored logos
  // score-logos recalc [offset]      — re-score all, optionally resume from offset
  const arg3 = process.argv[3] || "";
  const recalc = arg3 === "recalc";
  const limit = recalc ? 0 : parseInt(arg3, 10) || 0;
  const resumeOffset = recalc ? parseInt(process.argv[4] || "0", 10) || 0 : 0;
  const { scoreLogos } = await import("./modes/score-logos");
  scoreLogos(sql, limit, recalc, resumeOffset).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "reslug") {
  const { reslug } = await import("./modes/reslug");
  reslug(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "bimi-dns") {
  const limit = parseInt(process.argv[3] || "1000", 10);
  const { backfillBimiDns } = await import("./modes/backfill-bimi-dns");
  backfillBimiDns(sql, limit).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "refresh-dns") {
  const limit = parseInt(process.argv[3] || "1000", 10);
  const { refreshDns } = await import("./modes/refresh-dns");
  refreshDns(sql, limit).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-tile-bg-domains") {
  const { backfillTileBgDomains } = await import("./modes/backfill-tile-bg-domains");
  backfillTileBgDomains(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-scts") {
  const { backfillScts } = await import("./modes/backfill-scts");
  backfillScts(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-certs") {
  const limit = parseInt(process.argv[3] || "1000", 10);
  const { backfillCerts } = await import("./modes/backfill-certs");
  backfillCerts(sql, limit).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "backfill-logos") {
  const { backfillLogos } = await import("./modes/backfill-logos");
  backfillLogos(sql).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === "recalc-logo-counts") {
  console.log("Recalculating logo cert_count and domain_count...\n");
  await sql`
    UPDATE logos SET
      cert_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT logotype_svg_hash AS hash, count(*)::int AS cnt
      FROM certificates
      WHERE logotype_svg_hash IS NOT NULL
      GROUP BY logotype_svg_hash
    ) sub
    WHERE logos.svg_hash = sub.hash
  `;
  await sql`
    UPDATE logos SET
      domain_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT svg_hash, count(DISTINCT d)::int AS cnt FROM (
        SELECT logotype_svg_hash AS svg_hash, unnest(san_list) AS d
        FROM certificates
        WHERE logotype_svg_hash IS NOT NULL
        UNION ALL
        SELECT svg_indicator_hash AS svg_hash, domain AS d
        FROM domain_bimi_state
        WHERE svg_indicator_hash IS NOT NULL
      ) combined
      GROUP BY svg_hash
    ) sub
    WHERE logos.svg_hash = sub.svg_hash
  `;
  const [{ count }] = (await sql`SELECT count(*)::int AS count FROM logos`) as [{ count: number }];
  console.log(`Done. Updated counts for ${count} logos.`);
} else {
  const { backfill } = await import("./modes/backfill");
  backfill().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
