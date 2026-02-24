import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import {
  certificates,
  certificateChains,
  ingestionCursors,
} from "../lib/db/schema";
import { getSTH, getEntries, throttle } from "../lib/ct/gorgon";
import {
  parseCTLogEntry,
  hasBIMIOID,
  extractBIMIData,
  parseChainFromExtraData,
  parseChainCert,
} from "../lib/ct/parser";
import { dispatchNewCertNotification } from "../lib/notifications/dispatcher";
import type { CTLogEntry } from "../lib/ct/gorgon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle({ client: sql, schema: { certificates, certificateChains, ingestionCursors } });

const BATCH_SIZE = 256;

async function processEntries(
  startIndex: number,
  endIndex: number,
  notify: boolean
): Promise<number> {
  let found = 0;

  for (let i = startIndex; i < endIndex; i += BATCH_SIZE) {
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
            issuerOrg: bimiData.issuerOrg,
            sanList: bimiData.sanList,
            markType: bimiData.markType,
            certType: bimiData.certType,
            logotypeSvgHash: bimiData.logotypeSvgHash,
            logotypeSvg: bimiData.logotypeSvg,
            rawPem: bimiData.rawPem,
            ctLogTimestamp: new Date(parsed.timestamp),
            ctLogIndex: entryIndex,
            ctLogName: "gorgon",
            extensionsJson: bimiData.extensionsJson,
          })
          .onConflictDoNothing({ target: certificates.fingerprintSha256 })
          .returning({ id: certificates.id });

        if (inserted) {
          // Store certificate chain
          for (let k = 0; k < parsed.chainPems.length; k++) {
            const chainInfo = parseChainCert(parsed.chainPems[k]);
            const fingerprint = await computePemFingerprint(parsed.chainPems[k]);
            await db.insert(certificateChains).values({
              leafCertId: inserted.id,
              chainPosition: k + 1,
              fingerprintSha256: fingerprint,
              subjectDn: chainInfo?.subjectDn || "unknown",
              issuerDn: chainInfo?.issuerDn || "unknown",
              rawPem: parsed.chainPems[k],
              notBefore: chainInfo?.notBefore,
              notAfter: chainInfo?.notAfter,
            });
          }

          found++;

          if (notify) {
            dispatchNewCertNotification({
              certId: inserted.id,
              domain: bimiData.sanList[0] || bimiData.subjectCn || "unknown",
              org: bimiData.subjectOrg || "unknown",
              ca: bimiData.issuerOrg || "unknown",
              certType: bimiData.certType || "VMC",
              country: bimiData.subjectCountry,
            }).catch((err) =>
              console.error("  Notification dispatch error:", err)
            );
          }
        }
      } catch (err) {
        console.error(`\n  Error processing entry ${entryIndex}:`, err);
      }
    }

    // Update cursor after each batch
    await db
      .insert(ingestionCursors)
      .values({
        logName: "gorgon",
        lastIndex: i + response.entries.length,
        lastRun: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ingestionCursors.logName,
        set: {
          lastIndex: i + response.entries.length,
          lastRun: new Date(),
          updatedAt: new Date(),
        },
      });

    await throttle(150);
  }

  return found;
}

async function computePemFingerprint(pem: string): Promise<string> {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  let der: Uint8Array;
  if (typeof Buffer !== "undefined") {
    der = new Uint8Array(Buffer.from(b64, "base64"));
  } else {
    const binary = atob(b64);
    der = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  }
  const hash = await crypto.subtle.digest("SHA-256", der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// Entry point
const mode = process.argv[2] || "backfill";
console.log(`BIMI Intel Ingestion Worker - Mode: ${mode}`);

if (mode === "stream") {
  stream().catch(console.error);
} else {
  backfill().catch(console.error);
}
