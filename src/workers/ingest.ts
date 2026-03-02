import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { X509Certificate } from "@peculiar/x509";
import { eq } from "drizzle-orm";
import { getEntries, getSTH, throttle } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { extractBIMIData, hasBIMIOID, parseCTLogEntry, pemToDer } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";
import { computeVisualHash } from "@/lib/dhash";
import { scoreLogoQualityBatch, svgToPng } from "@/lib/logo-quality";
import { type BrandInput, classifyIndustryBatch, scoreNotabilityBatch } from "@/lib/notability";
import { toArrayBuffer } from "@/lib/pem";
import { computeColorRichness } from "@/lib/svg-color-richness";
import { errorMessage } from "@/lib/utils";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Raw sql template tag for utility modes (reparse, rescore, check)
const sql = neon(connectionString);

async function backfill() {
  console.log("Starting backfill mode...");
  const sth = await getSTH();
  console.log(`Gorgon tree size: ${sth.tree_size.toLocaleString()}`);

  const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
  const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

  console.log(`Resuming from index ${startIndex.toLocaleString()}`);
  const result = await processIngestBatch({
    startIndex,
    endIndex: sth.tree_size,
    notify: false,
    onProgress: (msg) => process.stdout.write(`\r  ${msg}`),
  });
  console.log(`\nBackfill complete. Found ${result.certsFound} BIMI certificates.`);
}

/**
 * Verify ingestion integrity by checking for gaps in ct_log_index coverage.
 * Compares the expected number of BIMI entries (sampled from the log) against
 * what's actually in the database.
 */
async function checkIntegrity() {
  console.log("Running ingestion integrity check...\n");

  const sth = await getSTH();
  console.log(`Gorgon tree size: ${sth.tree_size.toLocaleString()}`);

  const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
  const lastIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;
  console.log(`Cursor at: ${lastIndex.toLocaleString()}`);

  // Count certs and check for index gaps
  const result = await sql`
    SELECT
      count(*) as total_certs,
      min(ct_log_index) as min_index,
      max(ct_log_index) as max_index
    FROM certificates
    WHERE ct_log_name = 'gorgon'
  `;
  const { total_certs, min_index, max_index } = result[0] as {
    total_certs: string;
    min_index: string;
    max_index: string;
  };
  console.log(`DB certs: ${Number(total_certs).toLocaleString()} (indices ${min_index}-${max_index})`);

  // Find gaps > 10 in ct_log_index (small gaps are normal from non-BIMI entries)
  const gaps = await sql`
    WITH ordered AS (
      SELECT ct_log_index,
        ct_log_index - LAG(ct_log_index) OVER (ORDER BY ct_log_index) as gap
      FROM certificates
      WHERE ct_log_name = 'gorgon'
    )
    SELECT gap, count(*) as occurrences
    FROM ordered
    WHERE gap > 10
    GROUP BY gap
    ORDER BY occurrences DESC
    LIMIT 10
  `;

  if (gaps.length === 0) {
    console.log("\nNo suspicious gaps found. Ingestion looks healthy.");
  } else {
    console.log("\nSuspicious gaps in ct_log_index:");
    let totalMissing = 0;
    for (const g of gaps) {
      const { gap, occurrences } = g as { gap: string; occurrences: string };
      const missing = (Number(gap) - 1) * Number(occurrences);
      totalMissing += missing;
      console.log(`  gap=${gap} occurs ${occurrences}x (~${missing.toLocaleString()} missing entries)`);
    }
    console.log(`\n  Estimated missing entries: ~${totalMissing.toLocaleString()}`);
    console.log(`  Expected cert count: ~${(Number(total_certs) + totalMissing).toLocaleString()}`);
    console.log("\n  Run 'bun run ingest:backfill' with cursor reset to 0 to fill gaps.");
  }

  // Sanity check: sample a range from the log and compare coverage
  const sampleStart = Math.floor(Math.random() * Math.max(0, lastIndex - 200));
  const sampleEnd = sampleStart + 99;
  console.log(`\nSpot check: sampling entries ${sampleStart}-${sampleEnd} from Gorgon...`);

  try {
    const logEntries = await getEntries(sampleStart, sampleEnd);
    let bimiCount = 0;
    for (const entry of logEntries.entries) {
      try {
        const parsed = parseCTLogEntry(entry);
        if (parsed && hasBIMIOID(parsed.cert)) bimiCount++;
      } catch {
        /* skip */
      }
    }

    const dbCount = await sql`
      SELECT count(*) as cnt FROM certificates
      WHERE ct_log_name = 'gorgon'
        AND ct_log_index >= ${sampleStart}
        AND ct_log_index <= ${sampleEnd}
    `;
    const dbCerts = Number((dbCount[0] as { cnt: string }).cnt);

    console.log(`  Log has ${bimiCount} BIMI entries in this range`);
    console.log(`  DB has ${dbCerts} certs in this range`);

    const coverage = bimiCount > 0 ? ((dbCerts / bimiCount) * 100).toFixed(1) : "N/A";
    console.log(`  Coverage: ${coverage}%`);

    if (bimiCount > 0 && dbCerts / bimiCount < 0.9) {
      console.log("  WARNING: Coverage below 90% - data may be incomplete!");
    }
  } catch (err) {
    console.error("  Spot check failed:", err);
  }
}

async function stream() {
  console.log("Starting stream mode (polling every 30s)...");
  while (true) {
    try {
      const sth = await getSTH();
      const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
      const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

      if (startIndex < sth.tree_size) {
        console.log(`New entries: ${startIndex.toLocaleString()} -> ${sth.tree_size.toLocaleString()}`);
        const result = await processIngestBatch({
          startIndex,
          endIndex: sth.tree_size,
          notify: true,
          onProgress: (msg) => process.stdout.write(`\r  ${msg}`),
        });
        if (result.certsFound > 0) {
          console.log(`Found ${result.certsFound} new BIMI certificate(s)`);
        }
      }
    } catch (err) {
      console.error("Stream iteration error:", err);
    }

    await new Promise((r) => setTimeout(r, 30_000));
  }
}

/**
 * Re-extract SVGs and mark types from stored PEMs for certs missing them.
 * Useful after fixing the extraction logic without re-scanning the entire CT log.
 */
async function reparse() {
  console.log("Re-parsing stored certificates for SVG and mark type...\n");

  const BATCH = 100;
  let offset = 0;
  let updated = 0;

  while (true) {
    const rows = await sql`
      SELECT id, raw_pem, logotype_svg, mark_type
      FROM certificates
      ORDER BY id
      LIMIT ${BATCH} OFFSET ${offset}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      const { id, raw_pem, logotype_svg, mark_type } = row as {
        id: number;
        raw_pem: string;
        logotype_svg: string | null;
        mark_type: string | null;
      };

      if (logotype_svg && mark_type) continue;

      try {
        const der = pemToDer(raw_pem);
        const cert = new X509Certificate(toArrayBuffer(der));

        const bimiData = await extractBIMIData(cert, der);
        const updates: Record<string, string | null> = {};

        if (!logotype_svg && bimiData.logotypeSvg) {
          updates.logotype_svg = bimiData.logotypeSvg;
          updates.logotype_svg_hash = bimiData.logotypeSvgHash;
        }
        if (!mark_type && bimiData.markType) {
          updates.mark_type = bimiData.markType;
          updates.cert_type = bimiData.certType;
        }

        if (Object.keys(updates).length > 0) {
          await sql`
            UPDATE certificates SET
              logotype_svg = COALESCE(${updates.logotype_svg ?? null}, logotype_svg),
              logotype_svg_hash = COALESCE(${updates.logotype_svg_hash ?? null}, logotype_svg_hash),
              mark_type = COALESCE(${updates.mark_type ?? null}, mark_type),
              cert_type = COALESCE(${updates.cert_type ?? null}, cert_type)
            WHERE id = ${id}
          `;
          updated++;
          if (updated % 100 === 0) {
            process.stdout.write(`\r  Updated ${updated} certs...`);
          }
        }
      } catch (err) {
        console.error(`\n  Error re-parsing cert ${id}:`, err);
      }
    }

    offset += BATCH;
    process.stdout.write(`\r  Scanned ${offset} certs, updated ${updated}...`);
  }

  console.log(`\n\nRe-parse complete. Updated ${updated} certificates.`);
}

/**
 * Score notability for all certs that don't have a score yet.
 * Uses Claude Haiku to assess brand recognition.
 */
async function rescore(maxCerts = 0) {
  const label = maxCerts > 0 ? `newest ${maxCerts}` : "all";
  console.log(`Scoring notability for ${label} unscored certificates...\n`);

  const DB_BATCH = 50;
  const SCORE_BATCH = 10;
  let scored = 0;

  while (true) {
    if (maxCerts > 0 && scored >= maxCerts) break;

    // No OFFSET needed — scored rows drop out of the NULL filter each iteration
    const rows = await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE notability_score IS NULL
      ORDER BY id DESC
      LIMIT ${DB_BATCH}
    `;
    if (rows.length === 0) break;

    // Process in batches of SCORE_BATCH for efficient Haiku calls
    for (let i = 0; i < rows.length; i += SCORE_BATCH) {
      if (maxCerts > 0 && scored >= maxCerts) break;

      const remaining = maxCerts > 0 ? maxCerts - scored : SCORE_BATCH;
      const chunk = rows.slice(i, i + Math.min(SCORE_BATCH, remaining));

      const brands: BrandInput[] = chunk
        .map((row) => {
          const r = row as {
            id: number;
            subject_org: string | null;
            san_list: string[];
            subject_country: string | null;
          };
          return {
            id: String(r.id),
            org: r.subject_org || "",
            domain: r.san_list?.[0] || "unknown",
            country: r.subject_country || "unknown",
          };
        })
        .filter((b) => b.org);

      const results = await scoreNotabilityBatch(brands);

      for (const row of chunk) {
        const r = row as { id: number; subject_org: string | null; san_list: string[]; subject_country: string | null };
        const result = results.get(String(r.id));
        if (result) {
          await sql`
            UPDATE certificates SET
              notability_score = ${result.score},
              notability_reason = ${result.reason},
              company_description = ${result.description},
              industry = ${result.industry}
            WHERE id = ${r.id}
          `;
          scored++;
          const name = r.subject_org || r.san_list?.[0] || "unknown";
          console.log(`  Scored ${scored}: ${name} = ${result.score}/10`);
        }
      }

      await throttle(100);
    }
  }

  console.log(`\n\nRescore complete. Scored ${scored} certificates.`);
}

/**
 * Backfill industry for certs that were scored but have no industry.
 * Uses a lightweight industry-only classifier (cheaper than full rescore).
 */
async function backfillIndustry() {
  console.log("Backfilling industry for certs with industry IS NULL...\n");

  const BATCH = 50;
  let classified = 0;

  while (true) {
    const rows = await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE industry IS NULL AND subject_org IS NOT NULL
      ORDER BY id DESC
      LIMIT ${BATCH}
    `;
    if (rows.length === 0) break;

    const brands: BrandInput[] = rows
      .map((row) => {
        const r = row as { id: number; subject_org: string | null; san_list: string[]; subject_country: string | null };
        return {
          id: String(r.id),
          org: r.subject_org || "",
          domain: r.san_list?.[0] || "unknown",
          country: r.subject_country || "unknown",
        };
      })
      .filter((b) => b.org);

    const results = await classifyIndustryBatch(brands);

    for (const row of rows) {
      const r = row as { id: number; subject_org: string | null; san_list: string[] };
      const industry = results.get(String(r.id));
      if (industry) {
        await sql`UPDATE certificates SET industry = ${industry} WHERE id = ${r.id}`;
        classified++;
        const name = r.subject_org || r.san_list?.[0] || "unknown";
        console.log(`  ${classified}: ${name} -> ${industry}`);
      }
    }

    await throttle(100);
  }

  console.log(`\nBackfill complete. Classified ${classified} certificates.`);
}

/**
 * Score logo visual quality using Gemini Flash-Lite.
 * Groups by svg_hash to avoid re-scoring identical logos across certs.
 * Sends batches of 20 logos as 128x128 PNGs for multimodal scoring.
 *
 * @param maxLogos - 0 means no limit
 * @param recalc - if true, re-score all logos (not just unscored)
 * @param startOffset - for recalc resume: skip this many rows
 */
async function scoreLogos(maxLogos = 0, recalc = false, startOffset = 0) {
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

    const rows = recalc
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
        `;
    if (rows.length === 0) break;

    // Convert SVGs to PNGs
    const logos: { svgHash: string; png: Buffer; label: string }[] = [];
    for (const row of rows) {
      const { hash, svg, label } = row as { hash: string; svg: string; label: string | null };
      try {
        const png = await svgToPng(svg);
        logos.push({ svgHash: hash, png, label: label || hash.slice(0, 12) });
      } catch (err) {
        console.warn(`  SVG render failed for ${hash.slice(0, 12)}...: ${errorMessage(err)}`);
        await sql`
          UPDATE certificates SET logo_quality_score = 1
          WHERE logotype_svg_hash = ${hash}
        `;
        failed++;
      }
    }

    if (logos.length === 0) continue;

    try {
      const results = await scoreLogoQualityBatch(logos);

      for (const logo of logos) {
        const result = results.get(logo.svgHash);
        const score = result?.score ?? 5;
        const reason = result?.reason || null;
        await sql`
          UPDATE certificates SET logo_quality_score = ${score}, logo_quality_reason = ${reason}
          WHERE logotype_svg_hash = ${logo.svgHash}
        `;
        scored++;
        console.log(`  ${scored}: ${logo.label} = ${score}/10 (${reason || "no reason"})`);
      }
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

/**
 * Backfill color richness scores for existing SVGs.
 * Groups by svg_hash so each unique SVG is scored once, then applied to all certs with that hash.
 */
async function backfillColorRichness(recalc = false) {
  const mode = recalc ? "Re-scoring all" : "Backfilling unscored";
  console.log(`${mode} color richness scores...\n`);

  const BATCH = 100;
  let scored = 0;
  let lastHash = "";

  while (true) {
    const rows = recalc
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
            AND logo_color_richness IS NULL
          GROUP BY logotype_svg_hash
          LIMIT ${BATCH}
        `;
    if (rows.length === 0) break;

    for (const row of rows) {
      const { hash, svg } = row as { hash: string; svg: string };
      const score = computeColorRichness(svg);
      await sql`
        UPDATE certificates SET logo_color_richness = ${score}
        WHERE logotype_svg_hash = ${hash}
      `;
      lastHash = hash;
      scored++;
      if (scored % 100 === 0) {
        process.stdout.write(`\r  Scored ${scored} unique SVGs...`);
      }
    }
  }

  console.log(`\n${mode} complete. Scored ${scored} unique SVGs.`);
}

/**
 * Backfill perceptual visual hashes for existing SVGs.
 * Groups by logotype_svg_hash so each unique SVG is hashed once, then applied to all certs with that hash.
 */
async function backfillVisualHash(recalc = false) {
  const mode = recalc ? "Re-hashing all" : "Backfilling unhashed";
  console.log(`${mode} visual hashes...\n`);

  const BATCH = 100;
  let hashed = 0;
  let lastHash = "";

  const [{ count: totalRemaining }] = recalc
    ? await sql`SELECT COUNT(DISTINCT logotype_svg_hash) as count FROM certificates WHERE logotype_svg IS NOT NULL`
    : await sql`SELECT COUNT(DISTINCT logotype_svg_hash) as count FROM certificates WHERE logotype_svg IS NOT NULL AND logotype_visual_hash IS NULL`;
  console.log(`  ${totalRemaining} unique SVGs to hash\n`);

  while (true) {
    const rows = recalc
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
        `;
    if (rows.length === 0) break;

    for (const row of rows) {
      const { hash, svg } = row as { hash: string; svg: string };
      const visualHash = await computeVisualHash(svg);
      if (visualHash) {
        await sql`
          UPDATE certificates SET logotype_visual_hash = ${visualHash}
          WHERE logotype_svg_hash = ${hash}
        `;
      }
      lastHash = hash;
      hashed++;
      if (hashed % 100 === 0) {
        process.stdout.write(`\r  Hashed ${hashed} / ${totalRemaining} unique SVGs...`);
      }
    }
  }

  console.log(`\n${mode} complete. Hashed ${hashed} unique SVGs.`);
}

// Entry point
const mode = process.argv[2] || "backfill";
console.log(`BIMI Quest Ingestion Worker - Mode: ${mode}`);

if (mode === "stream") {
  stream().catch(console.error);
} else if (mode === "reparse") {
  reparse().catch(console.error);
} else if (mode === "check") {
  checkIntegrity().catch(console.error);
} else if (mode === "rescore") {
  const limit = parseInt(process.argv[3] || "0", 10);
  rescore(limit).catch(console.error);
} else if (mode === "backfill-industry") {
  backfillIndustry().catch(console.error);
} else if (mode === "backfill-color-richness") {
  const recalc = process.argv[3] === "recalc";
  backfillColorRichness(recalc).catch(console.error);
} else if (mode === "backfill-visual-hash") {
  const recalc = process.argv[3] === "recalc";
  backfillVisualHash(recalc).catch(console.error);
} else if (mode === "score-logos") {
  // score-logos [limit]              — backfill unscored logos
  // score-logos recalc [offset]      — re-score all, optionally resume from offset
  const arg3 = process.argv[3] || "";
  const recalc = arg3 === "recalc";
  const limit = recalc ? 0 : parseInt(arg3, 10) || 0;
  const resumeOffset = recalc ? parseInt(process.argv[4] || "0", 10) || 0 : 0;
  scoreLogos(limit, recalc, resumeOffset).catch(console.error);
} else {
  backfill().catch(console.error);
}
