import type { NeonQueryFunction } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { getEntries, getSTH } from "@/lib/ct/gorgon";
import { hasBIMIOID, parseCTLogEntry } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";
import type { CertStatsRow, CountRow, GapRow } from "../types";

/**
 * Verify ingestion integrity by checking for gaps in ct_log_index coverage.
 * Compares the expected number of BIMI entries (sampled from the log) against
 * what's actually in the database.
 */
export async function checkIntegrity(sql: NeonQueryFunction<false, false>) {
  console.log("Running ingestion integrity check...\n");

  const sth = await getSTH();
  console.log(`Gorgon tree size: ${sth.tree_size.toLocaleString()}`);

  const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
  const lastIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;
  console.log(`Cursor at: ${lastIndex.toLocaleString()}`);

  // Count certs and check for index gaps
  const result = (await sql`
    SELECT
      count(*) as total_certs,
      min(ct_log_index) as min_index,
      max(ct_log_index) as max_index
    FROM certificates
    WHERE ct_log_name = 'gorgon'
  `) as CertStatsRow[];
  const { total_certs, min_index, max_index } = result[0];
  console.log(`DB certs: ${Number(total_certs).toLocaleString()} (indices ${min_index}-${max_index})`);

  // Find gaps > 10 in ct_log_index (small gaps are normal from non-BIMI entries)
  const gaps = (await sql`
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
  `) as GapRow[];

  if (gaps.length === 0) {
    console.log("\nNo suspicious gaps found. Ingestion looks healthy.");
  } else {
    console.log("\nSuspicious gaps in ct_log_index:");
    let totalMissing = 0;
    for (const g of gaps) {
      const missing = (Number(g.gap) - 1) * Number(g.occurrences);
      totalMissing += missing;
      console.log(`  gap=${g.gap} occurs ${g.occurrences}x (~${missing.toLocaleString()} missing entries)`);
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

    const dbCount = (await sql`
      SELECT count(*) as cnt FROM certificates
      WHERE ct_log_name = 'gorgon'
        AND ct_log_index >= ${sampleStart}
        AND ct_log_index <= ${sampleEnd}
    `) as CountRow[];
    const dbCerts = Number(dbCount[0].cnt);

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
