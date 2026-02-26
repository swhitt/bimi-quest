import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import {
  certificates,
  chainCerts,
  certificateChainLinks,
  ingestionCursors,
} from "../lib/db/schema";
import { getSTH, getEntries, throttle } from "../lib/ct/gorgon";
import {
  parseCTLogEntry,
  hasBIMIOID,
  extractBIMIData,
  parseChainCert,
  extractDnField,
  computePemFingerprint,
} from "../lib/ct/parser";
import { dispatchNewCertNotification } from "../lib/notifications/dispatcher";
import { normalizeIssuerOrg } from "../lib/ca-display";
import { scoreNotability, scoreNotabilityBatch, type BrandInput } from "../lib/notability";
import { X509Certificate } from "@peculiar/x509";
import type { CTLogEntry } from "../lib/ct/gorgon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle({ client: sql, schema: { certificates, chainCerts, certificateChainLinks, ingestionCursors } });

const BATCH_SIZE = 256;

async function processEntries(
  startIndex: number,
  endIndex: number,
  notify: boolean
): Promise<number> {
  let found = 0;

  for (let i = startIndex; i < endIndex; ) {
    const batchEnd = Math.min(i + BATCH_SIZE - 1, endIndex - 1);
    const batchLabel = `${i.toLocaleString()}-${batchEnd.toLocaleString()} of ${endIndex.toLocaleString()}`;
    process.stdout.write(`\r  Fetching entries ${batchLabel}...`);

    let response: { entries: CTLogEntry[] };
    try {
      response = await getEntries(i, batchEnd);
    } catch (err) {
      console.error(`\n  Failed to fetch batch at ${i}:`, err);
      await throttle(2000);
      continue;
    }

    if (response.entries.length === 0) {
      // Server returned nothing - advance to avoid infinite loop
      i += BATCH_SIZE;
      continue;
    }

    let lastSuccessIndex = i - 1;

    for (let j = 0; j < response.entries.length; j++) {
      const entry = response.entries[j];
      const entryIndex = i + j;

      try {
        const parsed = parseCTLogEntry(entry);
        if (!parsed) continue;

        if (!hasBIMIOID(parsed.cert)) continue;

        // BIMI certificate found
        const bimiData = await extractBIMIData(parsed.cert, parsed.certDer);
        console.log(
          `\n  BIMI cert at index ${entryIndex}: ${bimiData.subjectCn || bimiData.subjectOrg || "unknown"} (${bimiData.issuerOrg || "unknown CA"})`
        );

        // Derive root CA org from chain before inserting
        let rootCaOrg: string | null = null;
        for (const chainPem of parsed.chainPems) {
          const info = parseChainCert(chainPem);
          if (info && info.subjectDn === info.issuerDn) {
            rootCaOrg = normalizeIssuerOrg(extractDnField(info.subjectDn, "O"));
            break;
          }
        }
        // Fall back to issuer org if no self-signed root in chain
        if (!rootCaOrg) rootCaOrg = normalizeIssuerOrg(bimiData.issuerOrg);

        const [inserted] = await db
          .insert(certificates)
          .values({
            fingerprintSha256: bimiData.fingerprintSha256,
            serialNumber: bimiData.serialNumber,
            notBefore: bimiData.notBefore,
            notAfter: bimiData.notAfter,
            subjectDn: bimiData.subjectDn,
            subjectCn: bimiData.subjectCn,
            subjectOrg: bimiData.subjectOrg,
            subjectCountry: bimiData.subjectCountry,
            subjectState: bimiData.subjectState,
            subjectLocality: bimiData.subjectLocality,
            issuerDn: bimiData.issuerDn,
            issuerCn: bimiData.issuerCn,
            issuerOrg: normalizeIssuerOrg(bimiData.issuerOrg),
            rootCaOrg,
            sanList: bimiData.sanList,
            markType: bimiData.markType,
            certType: bimiData.certType,
            logotypeSvgHash: bimiData.logotypeSvgHash,
            logotypeSvg: bimiData.logotypeSvg,
            rawPem: bimiData.rawPem,
            isPrecert: parsed.entryType === "precert",
            ctLogTimestamp: new Date(parsed.timestamp),
            ctLogIndex: entryIndex,
            ctLogName: "gorgon",
            extensionsJson: bimiData.extensionsJson,
          })
          .onConflictDoNothing({ target: certificates.fingerprintSha256 })
          .returning({ id: certificates.id, fingerprintSha256: certificates.fingerprintSha256 });

        if (inserted) {
          // Score notability only for genuinely new certs
          const notability = await scoreNotability(
            bimiData.subjectOrg,
            bimiData.sanList,
            bimiData.subjectCountry
          );
          if (notability) {
            await db
              .update(certificates)
              .set({
                notabilityScore: notability.score,
                notabilityReason: notability.reason,
                companyDescription: notability.description,
              })
              .where(eq(certificates.id, inserted.id));
          }
          // Store certificate chain (normalized: upsert unique certs, then link)
          for (let k = 0; k < parsed.chainPems.length; k++) {
            const chainInfo = parseChainCert(parsed.chainPems[k]);
            const fingerprint = await computePemFingerprint(parsed.chainPems[k]);
            const [chainCert] = await db
              .insert(chainCerts)
              .values({
                fingerprintSha256: fingerprint,
                subjectDn: chainInfo?.subjectDn || "unknown",
                issuerDn: chainInfo?.issuerDn || "unknown",
                rawPem: parsed.chainPems[k],
                notBefore: chainInfo?.notBefore,
                notAfter: chainInfo?.notAfter,
              })
              .onConflictDoNothing({ target: chainCerts.fingerprintSha256 })
              .returning({ id: chainCerts.id });

            // If conflict, look up existing id
            let chainCertId = chainCert?.id;
            if (!chainCertId) {
              const [existing] = await db
                .select({ id: chainCerts.id })
                .from(chainCerts)
                .where(eq(chainCerts.fingerprintSha256, fingerprint))
                .limit(1);
              chainCertId = existing.id;
            }

            await db.insert(certificateChainLinks).values({
              leafCertId: inserted.id,
              chainCertId,
              chainPosition: k + 1,
            });
          }

          found++;

          if (notify) {
            dispatchNewCertNotification({
              certId: inserted.id,
              fingerprintSha256: inserted.fingerprintSha256,
              domain: bimiData.sanList[0] || bimiData.subjectCn || "unknown",
              org: bimiData.subjectOrg || "unknown",
              ca: bimiData.issuerOrg || "unknown",
              certType: bimiData.certType || "VMC",
              country: bimiData.subjectCountry,
              notabilityScore: notability?.score,
              notabilityReason: notability?.reason,
              companyDescription: notability?.description,
            }).catch((err) =>
              console.error("  Notification dispatch error:", err)
            );
          }
        }
        lastSuccessIndex = entryIndex;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error && err.cause ? `\n    Cause: ${err.cause}` : "";
        console.error(`\n  Error processing entry ${entryIndex}: ${msg.slice(0, 200)}${cause}`);
        // Don't advance cursor past failed entries
        break;
      }
    }

    // Only advance cursor to last successfully processed entry + 1
    const newCursor = lastSuccessIndex + 1;
    if (newCursor > i) {
      i = newCursor;
    } else {
      // Nothing succeeded in this batch, stop to avoid infinite loop
      console.error(`\n  Batch starting at ${i} failed entirely, stopping.`);
      break;
    }

    // Update cursor after each batch
    await db
      .insert(ingestionCursors)
      .values({
        logName: "gorgon",
        lastIndex: i,
        lastRun: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ingestionCursors.logName,
        set: {
          lastIndex: i,
          lastRun: new Date(),
          updatedAt: new Date(),
        },
      });

    await throttle(150);
  }

  return found;
}

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
  const count = await processEntries(startIndex, sth.tree_size, false);
  console.log(`\nBackfill complete. Found ${count} BIMI certificates.`);
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
        const count = await processEntries(startIndex, sth.tree_size, true);
        if (count > 0) {
          console.log(`Found ${count} new BIMI certificate(s)`);
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

      // Skip if already has both SVG and mark type
      if (logotype_svg && mark_type) continue;

      try {
        const b64 = raw_pem
          .replace(/-----BEGIN CERTIFICATE-----/g, "")
          .replace(/-----END CERTIFICATE-----/g, "")
          .replace(/\s/g, "");
        const der = new Uint8Array(Buffer.from(b64, "base64"));
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

  const BATCH = 50;
  let offset = 0;
  let scored = 0;

  while (true) {
    if (maxCerts > 0 && scored >= maxCerts) break;

    const rows = await sql`
      SELECT id, subject_org, san_list, subject_country
      FROM certificates
      WHERE notability_score IS NULL
      ORDER BY id DESC
      LIMIT ${BATCH} OFFSET ${offset}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      if (maxCerts > 0 && scored >= maxCerts) break;
      const { id, subject_org, san_list, subject_country } = row as {
        id: number;
        subject_org: string | null;
        san_list: string[];
        subject_country: string | null;
      };

      const result = await scoreNotability(subject_org, san_list || [], subject_country);
      if (result) {
        await sql`
          UPDATE certificates SET
            notability_score = ${result.score},
            notability_reason = ${result.reason},
            company_description = ${result.description}
          WHERE id = ${id}
        `;
        scored++;
        const label = subject_org || (san_list && san_list[0]) || "unknown";
        console.log(`  Scored ${scored}: ${label} = ${result.score}/10`);
      }

      // Small delay to avoid rate limits
      await throttle(100);
    }

    offset += BATCH;
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
