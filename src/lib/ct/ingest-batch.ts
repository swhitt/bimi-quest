import { and, eq, inArray } from "drizzle-orm";
import { normalizeIssuerOrg } from "@/lib/ca-display";
import { NOTABILITY_NOTIFICATION_THRESHOLD } from "@/lib/constants";
import { getEntries, throttle } from "@/lib/ct/gorgon";
import {
  computePemFingerprint,
  extractBIMIData,
  extractDnField,
  hasBIMIOID,
  parseChainCert,
  parseCTLogEntry,
} from "@/lib/ct/parser";
import { getDb } from "@/lib/db";
import { certificateChainLinks, certificates, chainCerts, ingestionCursors } from "@/lib/db/schema";
import { type BrandInput, scoreNotabilityBatch } from "@/lib/notability";
import { dispatchNewCertNotification } from "@/lib/notifications/dispatcher";
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
  parseFailed: number;
  scoringFailed: number;
}

/** Batch-score pending certs with Haiku, update DB, and send notifications for notable ones. */
async function flushScores(batch: PendingCert[], notify: boolean): Promise<void> {
  const db = getDb();

  const brands: BrandInput[] = batch
    .filter((c) => c.org)
    .map((c) => ({
      id: String(c.id),
      org: c.org,
      domain: c.domain,
      country: c.country || "unknown",
    }));

  const scores = await scoreNotabilityBatch(brands);

  // Batch all score updates into a single HTTP request via Neon's db.batch()
  const updateQueries = batch
    .filter((cert) => scores.has(String(cert.id)))
    .map((cert) => {
      const notability = scores.get(String(cert.id))!;
      return db
        .update(certificates)
        .set({
          notabilityScore: notability.score,
          notabilityReason: notability.reason,
          companyDescription: notability.description,
          industry: notability.industry,
        })
        .where(eq(certificates.id, cert.id));
    });

  if (updateQueries.length > 0) {
    // Type-safe batch call: getDb() returns NeonHttpDatabase which has a typed batch() method
    await db.batch(updateQueries as [(typeof updateQueries)[0], ...typeof updateQueries]);
  }

  // Dispatch notifications for notable certs (separate from DB update)
  for (const cert of batch) {
    const notability = scores.get(String(cert.id)) ?? null;
    const score = notability?.score ?? 0;
    if (notify && score >= NOTABILITY_NOTIFICATION_THRESHOLD) {
      dispatchNewCertNotification({
        certId: cert.id,
        fingerprintSha256: cert.fingerprintSha256,
        domain: cert.domain,
        org: cert.org || "unknown",
        issuer: cert.issuer,
        rootCa: cert.rootCa,
        certType: cert.certType,
        country: cert.country,
        notabilityScore: notability?.score,
        notabilityReason: notability?.reason,
        companyDescription: notability?.description,
        hasLogo: cert.hasLogo,
      }).catch((err) => console.warn("Notification dispatch failed:", err));
    }
  }
}

/**
 * Shared ingestion loop: fetch CT log entries in batches, parse BIMI certs,
 * and upsert into the database. Scoring is decoupled and runs after all
 * batches complete to keep ingestion throughput high.
 */
export async function processIngestBatch(options: IngestBatchOptions): Promise<IngestBatchResult> {
  const { startIndex, endIndex, maxBatches = 0, notify = false, onProgress } = options;
  const db = getDb();

  const SCORE_BATCH_SIZE = 10;

  let found = 0;
  let processed = startIndex;
  let batchesRun = 0;
  let parseFailed = 0;
  let scoringFailed = 0;
  // Collect all inserted certs for post-ingestion scoring
  const allPendingScores: PendingCert[] = [];

  for (let i = startIndex; i < endIndex; ) {
    if (maxBatches > 0 && batchesRun >= maxBatches) break;

    const batchEnd = Math.min(i + BATCH_SIZE - 1, endIndex - 1);
    onProgress?.(
      `Fetching entries ${i.toLocaleString()}-${batchEnd.toLocaleString()} of ${endIndex.toLocaleString()}...`,
    );

    let response;
    try {
      response = await getEntries(i, batchEnd);
    } catch (err) {
      onProgress?.(`Failed to fetch batch at ${i}: ${errorMessage(err)}`);
      if (maxBatches > 0) break;
      await throttle(2000);
      continue;
    }

    if (response.entries.length === 0) {
      i += BATCH_SIZE;
      continue;
    }

    // Track which entries succeeded vs. failed for cursor advancement.
    // The cursor should only advance past entries that were actually processed
    // successfully, so that transient failures can be retried on the next run.
    let lastSuccessIndex = i - 1;
    let hadDbError = false;

    for (let j = 0; j < response.entries.length; j++) {
      const entry = response.entries[j];
      const entryIndex = i + j;

      try {
        const parsed = parseCTLogEntry(entry);
        if (!parsed) {
          // Parse failures are permanent (malformed entry) — safe to skip
          parseFailed++;
          lastSuccessIndex = entryIndex;
          continue;
        }
        if (!hasBIMIOID(parsed.cert)) {
          // Non-BIMI entry — safe to skip
          lastSuccessIndex = entryIndex;
          continue;
        }

        const bimiData = await extractBIMIData(parsed.cert, parsed.certDer);
        onProgress?.(
          `BIMI cert at index ${entryIndex}: ${bimiData.subjectCn || bimiData.subjectOrg || "unknown"} (${bimiData.issuerOrg || "unknown CA"})`,
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

        // Insert cert + handle precert supersession atomically via db.batch().
        // (neon-http does not support interactive transactions, but batch()
        // executes all queries in a single HTTP transaction.)
        const isPrecert = parsed.entryType === "precert";
        const certInsertQuery = db
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
            // Visual hash is deferred to the backfillVisualHash worker to keep
            // the ingestion hot path fast (sharp render is 50-200ms per cert)
            logotypeVisualHash: null,
            rawPem: bimiData.rawPem,
            isPrecert,
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

        // Supersession query: for a final cert, mark matching precerts as
        // superseded; for a precert, check if a final cert already exists.
        const supersessionQuery = isPrecert
          ? db
              .select({ id: certificates.id })
              .from(certificates)
              .where(and(eq(certificates.serialNumber, bimiData.serialNumber), eq(certificates.isPrecert, false)))
              .limit(1)
          : db
              .update(certificates)
              .set({ isSuperseded: true })
              .where(
                and(
                  eq(certificates.serialNumber, bimiData.serialNumber),
                  eq(certificates.isPrecert, true),
                  eq(certificates.isSuperseded, false),
                ),
              );

        const [insertResult, supersessionResult] = await db.batch([certInsertQuery, supersessionQuery]);

        const inserted = insertResult[0];

        if (inserted) {
          // For precerts: if a final cert already exists, mark this precert superseded
          if (isPrecert && (supersessionResult as { id: number }[]).length > 0) {
            await db.update(certificates).set({ isSuperseded: true }).where(eq(certificates.id, inserted.id));
          }

          // Parse chain cert data (fingerprints + metadata) in parallel
          const chainData = await Promise.all(
            parsed.chainPems.map(async (pem) => ({
              info: parseChainCert(pem),
              fingerprint: await computePemFingerprint(pem),
              pem,
            })),
          );

          if (chainData.length > 0) {
            // Batch INSERT all chain certs at once
            const chainInsertResults = await db
              .insert(chainCerts)
              .values(
                chainData.map(({ info: chainInfo, fingerprint, pem }) => ({
                  fingerprintSha256: fingerprint,
                  subjectDn: chainInfo?.subjectDn || "unknown",
                  issuerDn: chainInfo?.issuerDn || "unknown",
                  rawPem: pem,
                  notBefore: chainInfo?.notBefore,
                  notAfter: chainInfo?.notAfter,
                })),
              )
              .onConflictDoNothing({ target: chainCerts.fingerprintSha256 })
              .returning({ id: chainCerts.id, fingerprintSha256: chainCerts.fingerprintSha256 });

            // Build a fingerprint -> id map from returned rows (newly inserted)
            const chainIdMap = new Map<string, number>();
            for (const row of chainInsertResults) {
              chainIdMap.set(row.fingerprintSha256, row.id);
            }

            // For chain certs that already existed (not returned by INSERT),
            // batch SELECT their IDs
            const missingFingerprints = chainData.map((c) => c.fingerprint).filter((fp) => !chainIdMap.has(fp));

            if (missingFingerprints.length > 0) {
              const existingRows = await db
                .select({ id: chainCerts.id, fingerprintSha256: chainCerts.fingerprintSha256 })
                .from(chainCerts)
                .where(inArray(chainCerts.fingerprintSha256, missingFingerprints));
              for (const row of existingRows) {
                chainIdMap.set(row.fingerprintSha256, row.id);
              }
            }

            // Batch INSERT all chain links, skipping any with unresolved fingerprints
            const chainLinks = chainData
              .map(({ fingerprint }, k) => {
                const chainCertId = chainIdMap.get(fingerprint);
                return chainCertId != null ? { leafCertId: inserted.id, chainCertId, chainPosition: k + 1 } : null;
              })
              .filter((link): link is NonNullable<typeof link> => link != null);

            if (chainLinks.length > 0) {
              await db.insert(certificateChainLinks).values(chainLinks);
            }
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
        // Distinguish transient DB errors from parse errors: if the error
        // message suggests a database/network issue, stop the batch to avoid
        // silently skipping entries that could succeed on retry.
        const isTransient =
          msg.includes("fetch failed") ||
          msg.includes("CONNECT_TIMEOUT") ||
          msg.includes("connection") ||
          msg.includes("too many clients");
        if (isTransient) {
          onProgress?.(`Transient error at entry ${entryIndex}, stopping batch: ${msg.slice(0, 200)}`);
          hadDbError = true;
          break;
        }
        // Non-transient errors (parse/extraction bugs) — log but advance past them
        onProgress?.(`Error processing entry ${entryIndex}: ${msg.slice(0, 200)}`);
        lastSuccessIndex = entryIndex;
        continue;
      }
    }

    // Update cursor once per Gorgon batch instead of per-entry.
    // Only advance to the last successfully processed entry.
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

    // If we hit a transient DB error mid-batch, stop processing to allow retry
    if (hadDbError) break;

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
        scoringFailed += batch.length;
        console.error("Scoring flush failed:", err);
      }
    }
  }

  return { certsFound: found, lastIndex: processed, batchesRun, parseFailed, scoringFailed };
}
