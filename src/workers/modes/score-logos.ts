import type { NeonQueryFunction } from "@neondatabase/serverless";
import { throttle } from "@/lib/ct/gorgon";
import { scoreLogoQualityBatch, svgToPng } from "@/lib/logo-quality";
import { errorMessage } from "@/lib/utils";
import { batchUpdateLogoQuality } from "../batch-update";
import type { LogoGroupRow } from "../types";

/**
 * Score logo visual quality using Gemini Flash-Lite.
 * Groups by svg_hash to avoid re-scoring identical logos across certs.
 * Sends batches of 20 logos as 128x128 PNGs for multimodal scoring.
 *
 * @param maxLogos - 0 means no limit
 * @param recalc - if true, re-score all logos (not just unscored)
 * @param startOffset - for recalc resume: skip this many rows
 */
export async function scoreLogos(sql: NeonQueryFunction<false, false>, maxLogos = 0, recalc = false, startOffset = 0) {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required for logo scoring");
    process.exit(1);
  }

  const modeLabel = recalc ? "recalc" : "backfill";
  const limitLabel = maxLogos > 0 ? `up to ${maxLogos}` : "all";
  console.log(`Scoring logo visual quality (${modeLabel}, ${limitLabel}) with Gemini Flash-Lite...`);
  if (startOffset) console.log(`Resuming from offset ${startOffset}`);
  console.log();

  const BATCH = 50;
  let scored = 0;
  let failed = 0;
  let offset = startOffset;

  while (true) {
    if (maxLogos > 0 && scored + failed >= maxLogos) break;

    const remaining = maxLogos > 0 ? Math.min(BATCH, maxLogos - scored - failed) : BATCH;

    const rows = (
      recalc
        ? await sql`
          SELECT logotype_svg_hash as hash,
            (array_agg(logotype_svg ORDER BY notability_score DESC NULLS LAST))[1] as svg,
            (array_agg(COALESCE(subject_org, san_list[1]) ORDER BY notability_score DESC NULLS LAST))[1] as label
          FROM certificates
          WHERE logotype_svg_hash IS NOT NULL
            AND logotype_svg IS NOT NULL
          GROUP BY logotype_svg_hash
          ORDER BY logotype_svg_hash
          LIMIT ${remaining} OFFSET ${offset}
        `
        : await sql`
          SELECT logotype_svg_hash as hash,
            (array_agg(logotype_svg ORDER BY notability_score DESC NULLS LAST))[1] as svg,
            (array_agg(COALESCE(subject_org, san_list[1]) ORDER BY notability_score DESC NULLS LAST))[1] as label
          FROM certificates
          WHERE logotype_svg_hash IS NOT NULL
            AND logotype_svg IS NOT NULL
            AND logo_quality_score IS NULL
          GROUP BY logotype_svg_hash
          LIMIT ${remaining}
        `
    ) as LogoGroupRow[];
    if (rows.length === 0) break;

    // Convert SVGs to PNGs
    const logos: { svgHash: string; png: Buffer; label: string }[] = [];
    const renderFailUpdates: { hash: string; score: number; reason: string | null }[] = [];

    for (const row of rows) {
      try {
        const png = await svgToPng(row.svg);
        logos.push({ svgHash: row.hash, png, label: row.label || row.hash.slice(0, 12) });
      } catch (err) {
        console.warn(`  SVG render failed for ${row.hash.slice(0, 12)}...: ${errorMessage(err)}`);
        renderFailUpdates.push({ hash: row.hash, score: 1, reason: null });
        failed++;
      }
    }

    // Batch-update render failures
    if (renderFailUpdates.length > 0) {
      await batchUpdateLogoQuality(sql, renderFailUpdates);
    }

    if (logos.length === 0) continue;

    try {
      const results = await scoreLogoQualityBatch(logos);
      const updates: { hash: string; score: number; reason: string | null }[] = [];

      for (const logo of logos) {
        const result = results.get(logo.svgHash);
        const score = result?.score ?? 5;
        const reason = result?.reason || null;
        updates.push({ hash: logo.svgHash, score, reason });
        scored++;
        console.log(`  ${scored}: ${logo.label} = ${score}/10 (${reason || "no reason"})`);
      }

      await batchUpdateLogoQuality(sql, updates);
    } catch (err) {
      console.error(`\n  Gemini API error:`, errorMessage(err));
      if (recalc) console.error(`  Resume: bun run ingest:score-logos recalc ${offset}`);
      await throttle(5000);
    }

    if (recalc) offset += rows.length;

    if ((scored + failed) % 100 === 0) {
      console.log(`  [checkpoint] ${scored + failed} done${recalc ? `, offset ${offset}` : ""}`);
    }

    await throttle(200);
  }

  console.log(`\nLogo scoring complete. Scored ${scored}, failed to render ${failed}.`);
  if (recalc) console.log(`Final offset: ${offset}`);
}
