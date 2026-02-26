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
import { scoreNotabilityBatch, type BrandInput, type NotabilityResult } from "@/lib/notability";

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

  const SCORE_BATCH_SIZE = 10;

  let found = 0;
  let processed = startIndex;
  let batchesRun = 0;

  // Pending certs that need notability scoring + notification
  type PendingCert = {
    id: number;
    fingerprintSha256: string;
    org: string;
    domain: string;
    country: string | null;
    ca: string;
    certType: string;
    hasLogo: boolean;
  };
  let pendingScores: PendingCert[] = [];

  /** Flush pending scores: batch-score with Haiku, update DB, send notifications */
  async function flushScores() {
    if (pendingScores.length === 0) return;
    const batch = pendingScores;
    pendingScores = [];

    const brands: BrandInput[] = batch
      .filter((c) => c.org)
      .map((c) => ({
        id: String(c.id),
        org: c.org,
        domain: c.domain,
        country: c.country || "unknown",
      }));

    const scores = await scoreNotabilityBatch(brands);

    for (const cert of batch) {
      const notability = scores.get(String(cert.id)) ?? null;
      if (notability) {
        await db
          .update(certificates)
          .set({
            notabilityScore: notability.score,
            notabilityReason: notability.reason,
            companyDescription: notability.description,
          })
          .where(eq(certificates.id, cert.id));
      }

      // Only notify for notable brands (score >= 5) to avoid Discord spam
      const score = notability?.score ?? 0;
      if (notify && score >= 5) {
        dispatchNewCertNotification({
          certId: cert.id,
          fingerprintSha256: cert.fingerprintSha256,
          domain: cert.domain,
          org: cert.org || "unknown",
          ca: cert.ca,
          certType: (cert.certType as "VMC" | "CMC") || "VMC",
          country: cert.country,
          notabilityScore: notability?.score,
          notabilityReason: notability?.reason,
          companyDescription: notability?.description,
          hasLogo: cert.hasLogo,
        }).catch(() => {});
      }
    }
  }

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
          .returning({
            id: certificates.id,
            fingerprintSha256: certificates.fingerprintSha256,
          });

        if (inserted) {
          // Store certificate chain
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

          // Queue for batch scoring + notification
          pendingScores.push({
            id: inserted.id,
            fingerprintSha256: inserted.fingerprintSha256,
            org: bimiData.subjectOrg || "unknown",
            domain: bimiData.sanList[0] || bimiData.subjectCn || "unknown",
            country: bimiData.subjectCountry,
            ca: bimiData.issuerOrg || "unknown",
            certType: bimiData.certType || "VMC",
            hasLogo: !!bimiData.logotypeSvg,
          });

          if (pendingScores.length >= SCORE_BATCH_SIZE) {
            await flushScores();
          }
        }
        lastSuccessIndex = entryIndex;

        // Save cursor after each entry so progress survives timeouts
        const entryCursor = entryIndex + 1;
        await db
          .insert(ingestionCursors)
          .values({
            logName: "gorgon",
            lastIndex: entryCursor,
            lastRun: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: ingestionCursors.logName,
            set: {
              lastIndex: entryCursor,
              lastRun: new Date(),
              updatedAt: new Date(),
            },
          });
        processed = entryCursor;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onProgress?.(
          `Error processing entry ${entryIndex}: ${msg.slice(0, 200)}`
        );
        break;
      }
    }

    // Flush any remaining scores after this Gorgon batch
    await flushScores();

    const newCursor = lastSuccessIndex + 1;
    if (newCursor > i) {
      i = newCursor;
    } else {
      onProgress?.(`Batch starting at ${i} failed entirely, stopping.`);
      break;
    }

    batchesRun++;

    await throttle(150);
  }

  // Flush any stragglers
  await flushScores();

  return { certsFound: found, lastIndex: processed, batchesRun };
}
