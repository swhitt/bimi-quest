import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getLogList } from "@/lib/ct/log-list";
import { parseSCTList } from "@/lib/ct/sct-parser";
import type { SctBackfillRow } from "../types";

const SCT_OID = "1.3.6.1.4.1.11129.2.4.2";

/**
 * Backfill SCT data from stored extension JSON into the certificate_scts table.
 * Follows the reparse.ts batch pattern: iterate by id > lastId in batches of 100.
 */
export async function backfillScts(sql: NeonQueryFunction<false, false>) {
  console.log("Backfilling SCT data from extension JSON...\n");

  const logList = await getLogList();
  console.log(`  Loaded ${logList.size} CT logs from Google's log list\n`);

  const BATCH = 100;
  let lastId = 0;
  let scanned = 0;
  let populated = 0;
  let skipped = 0;

  while (true) {
    const rows = (await sql`
      SELECT c.id, c.not_before, c.extensions_json
      FROM certificates c
      WHERE c.id > ${lastId}
        AND c.extensions_json IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM certificate_scts s WHERE s.certificate_id = c.id
        )
      ORDER BY c.id
      LIMIT ${BATCH}
    `) as SctBackfillRow[];

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const ext = row.extensions_json;
        if (!ext) {
          skipped++;
          continue;
        }

        const sctEntry = ext[SCT_OID];
        if (!sctEntry) {
          skipped++;
          continue;
        }

        // Handle both ExtensionEntry format and legacy string format
        const hex = typeof sctEntry === "string" ? sctEntry : sctEntry.v;
        if (!hex) {
          skipped++;
          continue;
        }

        const scts = parseSCTList(hex);
        if (scts.length === 0) {
          skipped++;
          continue;
        }

        const notBefore = new Date(row.not_before);

        for (const sct of scts) {
          const sctDate = new Date(sct.timestamp);
          const lagSeconds = Math.round((sctDate.getTime() - notBefore.getTime()) / 1000);

          const logInfo = logList.get(sct.logId);

          await sql`
            INSERT INTO certificate_scts (
              certificate_id, sct_version, log_id, sct_timestamp,
              hash_algorithm, sig_algorithm,
              log_name, log_operator, log_url, lag_seconds
            ) VALUES (
              ${row.id}, ${sct.version}, ${sct.logId}, ${sctDate.toISOString()},
              ${sct.hashAlgorithm}, ${sct.signatureAlgorithm},
              ${logInfo?.description ?? null}, ${logInfo?.operator ?? null},
              ${logInfo?.url ?? null}, ${lagSeconds}
            )
            ON CONFLICT (certificate_id, log_id) DO NOTHING
          `;
        }

        // Update denormalized sct_count
        await sql`
          UPDATE certificates SET sct_count = ${scts.length} WHERE id = ${row.id}
        `;

        populated++;
        if (populated % 50 === 0) {
          process.stdout.write(`\r  Populated ${populated} certs, skipped ${skipped}...`);
        }
      } catch (err) {
        console.error(`\n  Error processing cert ${row.id}:`, err);
      }
    }

    lastId = rows[rows.length - 1].id;
    scanned += rows.length;
    process.stdout.write(`\r  Scanned ${scanned} certs, populated ${populated}, skipped ${skipped}...`);
  }

  console.log(`\n\nSCT backfill complete. Populated ${populated} certificates, skipped ${skipped}.`);
}
