import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";

// Allow up to 60s on Vercel Pro (hobby: 10s max)
export const maxDuration = 60;
import {
  certificates,
  chainCerts,
  certificateChainLinks,
  ingestionCursors,
} from "@/lib/db/schema";
import { getSTH, getEntries, throttle } from "@/lib/ct/gorgon";
import {
  parseCTLogEntry,
  hasBIMIOID,
  extractBIMIData,
  parseChainCert,
  extractDnField,
} from "@/lib/ct/parser";
import { dispatchNewCertNotification } from "@/lib/notifications/dispatcher";
import { normalizeIssuerOrg } from "@/lib/ca-display";
import { scoreNotability } from "@/lib/notability";

// Vercel cron jobs send this header for authentication
const CRON_SECRET = process.env.CRON_SECRET;

// Vercel function timeout: process entries in chunks that fit within the limit.
// Pro plan gets 60s, hobby gets 10s. We leave headroom for DB writes.
const BATCH_SIZE = 256;
const MAX_BATCHES = 10;

async function computePemFingerprint(pem: string): Promise<string> {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  const der = new Uint8Array(Buffer.from(b64, "base64"));
  const hash = await crypto.subtle.digest(
    "SHA-256",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const sth = await getSTH();
    const treeSize = sth.tree_size;

    const cursor = await db
      .select()
      .from(ingestionCursors)
      .where(eq(ingestionCursors.logName, "gorgon"))
      .limit(1);
    const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

    if (startIndex >= treeSize) {
      return NextResponse.json({
        status: "up-to-date",
        treeSize,
        cursor: startIndex,
      });
    }

    const behind = treeSize - startIndex;
    let found = 0;
    let processed = startIndex;
    let batchesRun = 0;

    for (let i = startIndex; i < treeSize && batchesRun < MAX_BATCHES; ) {
      const batchEnd = Math.min(i + BATCH_SIZE - 1, treeSize - 1);

      let response;
      try {
        response = await getEntries(i, batchEnd);
      } catch {
        break;
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
            }).catch(() => {});
          }
          lastSuccessIndex = entryIndex;
        } catch {
          break;
        }
      }

      const newCursor = lastSuccessIndex + 1;
      if (newCursor > i) {
        i = newCursor;
      } else {
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

    return NextResponse.json({
      status: "synced",
      treeSize,
      previousCursor: startIndex,
      newCursor: processed,
      behind,
      entriesProcessed: processed - startIndex,
      certsFound: found,
      batchesRun,
    });
  } catch (error) {
    console.error("Cron ingest error:", error);
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 500 }
    );
  }
}
