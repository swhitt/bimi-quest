import { eq, and } from "drizzle-orm";
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
import { computeColorRichness } from "@/lib/svg-color-richness";
import { errorMessage } from "@/lib/utils";

const BATCH_SIZE = 256;

interface PendingCert {
  id: number;
  fingerprintSha256: string;
  org: string;
  domain: string;
  country: string | null;
  issuer: string;
  rootCa: string;
  certType: "VMC" | "CMC" | null;
  hasLogo: boolean;
}

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

/** Batch-score pending certs with Haiku, update DB, and send notifications for notable ones. */
async function flushScores(batch: PendingCert[], notify: boolean): Promise<void> {
  const brands: BrandInput[] = batch
    .filter((c) => c.org)
    .map((c) => ({
      id: String(c.id),
      org: c.org,
      domain: c.domain,
      country: c.country || "unknown",
    }));

  const scores = await scoreNotabilityBatch(brands);

  await Promise.all(batch.map(async (cert) => {
    const notability = scores.get(String(cert.id)) ?? null;
    if (notability) {
      await db
        .update(certificates)
        .set({
          notabilityScore: notability.score,
          notabilityReason: notability.reason,
          companyDescription: notability.description,
          industry: notability.industry,
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
        issuer: cert.issuer,
        rootCa: cert.rootCa,
        certType: cert.certType ?? "VMC",
        country: cert.country,
        notabilityScore: notability?.score,
        notabilityReason: notability?.reason,
        companyDescription: notability?.description,
        hasLogo: cert.hasLogo,
      }).catch((err) => console.warn("Notification dispatch failed:", err));
    }
  }));
}

/**
 * Shared ingestion loop: fetch CT log entries in batches, parse BIMI certs,
 * and upsert into the database. Scoring is decoupled and runs after all
 * batches complete to keep ingestion throughput high.
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
  // Collect all inserted certs for post-ingestion scoring
  const allPendingScores: PendingCert[] = [];

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
        `Failed to fetch batch at ${i}: ${errorMessage(err)}`
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
            logoColorRichness: bimiData.logotypeSvg ? computeColorRichness(bimiData.logotypeSvg) : null,
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
          // Mark precert/final pairs: if we just inserted a final cert, mark
          // matching precert(s) as superseded. If we inserted a precert and a
          // final cert already exists, mark this precert as superseded.
          const isPrecert = parsed.entryType === "precert";
          if (!isPrecert) {
            await db
              .update(certificates)
              .set({ isSuperseded: true })
              .where(
                and(
                  eq(certificates.serialNumber, bimiData.serialNumber),
                  eq(certificates.isPrecert, true),
                  eq(certificates.isSuperseded, false)
                )
              );
          } else {
            const [finalExists] = await db
              .select({ id: certificates.id })
              .from(certificates)
              .where(
                and(
                  eq(certificates.serialNumber, bimiData.serialNumber),
                  eq(certificates.isPrecert, false)
                )
              )
              .limit(1);
            if (finalExists) {
              await db
                .update(certificates)
                .set({ isSuperseded: true })
                .where(eq(certificates.id, inserted.id));
            }
          }

          // Batch chain cert inserts: compute all fingerprints first, then bulk upsert
          const chainData = await Promise.all(
            parsed.chainPems.map(async (pem) => ({
              info: parseChainCert(pem),
              fingerprint: await computePemFingerprint(pem),
              pem,
            }))
          );

          for (let k = 0; k < chainData.length; k++) {
            const { info: chainInfo, fingerprint, pem } = chainData[k];
            const [chainCert] = await db
              .insert(chainCerts)
              .values({
                fingerprintSha256: fingerprint,
                subjectDn: chainInfo?.subjectDn || "unknown",
                issuerDn: chainInfo?.issuerDn || "unknown",
                rawPem: pem,
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

          // Collect for post-ingestion scoring (decoupled from main loop)
          allPendingScores.push({
            id: inserted.id,
            fingerprintSha256: inserted.fingerprintSha256,
            org: bimiData.subjectOrg || "unknown",
            domain: bimiData.sanList[0] || bimiData.subjectCn || "unknown",
            country: bimiData.subjectCountry,
            issuer: normalizeIssuerOrg(bimiData.issuerOrg) || "unknown",
            rootCa: rootCaOrg || normalizeIssuerOrg(bimiData.issuerOrg) || "unknown",
            certType: bimiData.certType,
            hasLogo: !!bimiData.logotypeSvg,
          });
        }
        lastSuccessIndex = entryIndex;
      } catch (err) {
        const msg = errorMessage(err);
        onProgress?.(
          `Error processing entry ${entryIndex}: ${msg.slice(0, 200)}`
        );
        continue;
      }
    }

    // Update cursor once per Gorgon batch instead of per-entry
    const newCursor = lastSuccessIndex + 1;
    if (newCursor > i) {
      const now = new Date();
      await db
        .insert(ingestionCursors)
        .values({
          logName: "gorgon",
          lastIndex: newCursor,
          lastRun: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: ingestionCursors.logName,
          set: {
            lastIndex: newCursor,
            lastRun: now,
            updatedAt: now,
          },
        });
      processed = newCursor;
      i = newCursor;
    } else {
      onProgress?.(`Batch starting at ${i} failed entirely, stopping.`);
      break;
    }

    batchesRun++;

    await throttle(150);
  }

  // Score all discovered certs after ingestion completes (decoupled from main loop)
  if (allPendingScores.length > 0) {
    onProgress?.(`Scoring ${allPendingScores.length} new certs...`);
    for (let s = 0; s < allPendingScores.length; s += SCORE_BATCH_SIZE) {
      const batch = allPendingScores.slice(s, s + SCORE_BATCH_SIZE);
      try {
        await flushScores(batch, notify);
      } catch (err) {
        console.error("Scoring flush failed:", err);
      }
    }
  }

  return { certsFound: found, lastIndex: processed, batchesRun };
}
