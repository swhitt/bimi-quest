import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  certificates,
  chainCerts,
  certificateChainLinks,
  ingestionCursors,
} from "@/lib/db/schema";
import { getEntries, throttle } from "@/lib/ct/gorgon";
import {
  parseCTLogEntry,
  hasBIMIOID,
  extractBIMIData,
  parseChainCert,
  extractDnField,
  computePemFingerprint,
} from "@/lib/ct/parser";
import { dispatchNewCertNotification } from "@/lib/notifications/dispatcher";
import { normalizeIssuerOrg } from "@/lib/ca-display";
import { scoreNotability } from "@/lib/notability";

const BATCH_SIZE = 256;

export interface IngestBatchOptions {
  startIndex: number;
  endIndex: number;
  /** Stop after this many batches (0 = unlimited) */
  maxBatches?: number;
  /** Send Discord notifications for new certs */
  notify?: boolean;
  /** Called with progress messages (for logging) */
  onProgress?: (msg: string) => void;
}

export interface IngestBatchResult {
  certsFound: number;
  lastIndex: number;
  batchesRun: number;
}

/**
 * Shared ingestion loop: fetch CT log entries in batches, parse BIMI certs,
 * enrich with chain/notability data, and upsert into the database.
 */
export async function processIngestBatch(
  options: IngestBatchOptions
): Promise<IngestBatchResult> {
  const {
    startIndex,
    endIndex,
    maxBatches = 0,
    notify = false,
    onProgress,
  } = options;

  let found = 0;
  let processed = startIndex;
  let batchesRun = 0;

  for (let i = startIndex; i < endIndex; ) {
    if (maxBatches > 0 && batchesRun >= maxBatches) break;

    const batchEnd = Math.min(i + BATCH_SIZE - 1, endIndex - 1);
    onProgress?.(
      `Fetching entries ${i.toLocaleString()}-${batchEnd.toLocaleString()} of ${endIndex.toLocaleString()}...`
    );

    let response;
    try {
      response = await getEntries(i, batchEnd);
    } catch (err) {
      onProgress?.(
        `Failed to fetch batch at ${i}: ${err instanceof Error ? err.message : String(err)}`
      );
      // In bounded mode (cron), bail out. In unbounded mode (worker), let caller retry.
      if (maxBatches > 0) break;
      await throttle(2000);
      continue;
    }

    if (response.entries.length === 0) {
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

        const bimiData = await extractBIMIData(parsed.cert, parsed.certDer);
        onProgress?.(
          `BIMI cert at index ${entryIndex}: ${bimiData.subjectCn || bimiData.subjectOrg || "unknown"} (${bimiData.issuerOrg || "unknown CA"})`
        );

        // Derive root CA org from chain
        let rootCaOrg: string | null = null;
        for (const chainPem of parsed.chainPems) {
          const info = parseChainCert(chainPem);
          if (info && info.subjectDn === info.issuerDn) {
            rootCaOrg = normalizeIssuerOrg(extractDnField(info.subjectDn, "O"));
            break;
          }
        }
        if (!rootCaOrg) rootCaOrg = normalizeIssuerOrg(bimiData.issuerOrg);

        // Score brand notability (non-blocking: null on failure)
        const notability = await scoreNotability(
          bimiData.subjectOrg,
          bimiData.sanList,
          bimiData.subjectCountry
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
            notabilityScore: notability?.score,
            notabilityReason: notability?.reason,
            companyDescription: notability?.description,
          })
          .onConflictDoNothing({ target: certificates.fingerprintSha256 })
          .returning({
            id: certificates.id,
            fingerprintSha256: certificates.fingerprintSha256,
          });

        if (inserted) {
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
              domain:
                bimiData.sanList[0] || bimiData.subjectCn || "unknown",
              org: bimiData.subjectOrg || "unknown",
              ca: bimiData.issuerOrg || "unknown",
              certType: bimiData.certType || "VMC",
              country: bimiData.subjectCountry,
              notabilityScore: notability?.score,
              notabilityReason: notability?.reason,
              companyDescription: notability?.description,
              hasLogo: !!bimiData.logotypeSvg,
            }).catch(() => {});
          }
        }
        lastSuccessIndex = entryIndex;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onProgress?.(
          `Error processing entry ${entryIndex}: ${msg.slice(0, 200)}`
        );
        break;
      }
    }

    const newCursor = lastSuccessIndex + 1;
    if (newCursor > i) {
      i = newCursor;
    } else {
      onProgress?.(`Batch starting at ${i} failed entirely, stopping.`);
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

    processed = i;
    batchesRun++;

    await throttle(150);
  }

  return { certsFound: found, lastIndex: processed, batchesRun };
}
