import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { ingestionCursors } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { getSTH, getEntries, throttle } from "@/lib/ct/gorgon";
import {
  parseCTLogEntry,
  hasBIMIOID,
  extractBIMIData,
  pemToDer,
} from "@/lib/ct/parser";
import { scoreNotabilityBatch, type BrandInput } from "@/lib/notability";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { X509Certificate } from "@peculiar/x509";

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

  const cursor = await db
    .select()
    .from(ingestionCursors)
    .where(eq(ingestionCursors.logName, "gorgon"))
    .limit(1);
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

  const cursor = await db
    .select()
    .from(ingestionCursors)
    .where(eq(ingestionCursors.logName, "gorgon"))
    .limit(1);
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
      } catch { /* skip */ }
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
      const cursor = await db
        .select()
        .from(ingestionCursors)
        .where(eq(ingestionCursors.logName, "gorgon"))
        .limit(1);
      const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

      if (startIndex < sth.tree_size) {
        console.log(
          `New entries: ${startIndex.toLocaleString()} -> ${sth.tree_size.toLocaleString()}`
        );
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
        const cert = new X509Certificate(
          der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
        );

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
  let offset = 0;
  let scored = 0;

  while (true) {
    if (maxCerts > 0 && scored >= maxCerts) break;

    const rows = await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE notability_score IS NULL
      ORDER BY id DESC
      LIMIT ${DB_BATCH} OFFSET ${offset}
    `;
    if (rows.length === 0) break;

    // Process in batches of SCORE_BATCH for efficient Haiku calls
    for (let i = 0; i < rows.length; i += SCORE_BATCH) {
      if (maxCerts > 0 && scored >= maxCerts) break;

      const remaining = maxCerts > 0 ? maxCerts - scored : SCORE_BATCH;
      const chunk = rows.slice(i, i + Math.min(SCORE_BATCH, remaining));

      const brands: BrandInput[] = chunk
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

      const results = await scoreNotabilityBatch(brands);

      for (const row of chunk) {
        const r = row as { id: number; subject_org: string | null; san_list: string[]; subject_country: string | null };
        const result = results.get(String(r.id));
        if (result) {
          await sql`
            UPDATE certificates SET
              notability_score = ${result.score},
              notability_reason = ${result.reason},
              company_description = ${result.description}
            WHERE id = ${r.id}
          `;
          scored++;
          const name = r.subject_org || r.san_list?.[0] || "unknown";
          console.log(`  Scored ${scored}: ${name} = ${result.score}/10`);
        }
      }

      await throttle(100);
    }

    offset += DB_BATCH;
  }

  console.log(`\n\nRescore complete. Scored ${scored} certificates.`);
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
} else {
  backfill().catch(console.error);
}
