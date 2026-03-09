import { X509Certificate } from "@peculiar/x509";
import { and, eq } from "drizzle-orm";
import { buildCertInsertValues } from "@/lib/ct/cert-values";
import { extractBIMIData, hasBIMIOID } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { scoreNotability } from "@/lib/notability";
import { toArrayBuffer } from "@/lib/pem";

/**
 * Ingest a BIMI certificate from raw PEM into the database.
 * Used when a user validates a domain and we discover a cert not already in our DB.
 * Returns the fingerprint if inserted, null if already existed or not a BIMI cert.
 *
 * Parse/validation failures (not a BIMI cert, malformed PEM) return null.
 * Database/infrastructure errors are re-thrown so callers can handle them
 * (e.g. retry or alert) rather than silently losing certificates.
 */
export async function ingestFromPem(pem: string, source: string = "validation"): Promise<string | null> {
  // Phase 1: Parse and validate the certificate. Failures here are expected
  // (e.g. non-BIMI cert, malformed PEM) and should return null.
  let bimiData: Awaited<ReturnType<typeof extractBIMIData>>;
  try {
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = new Uint8Array(Buffer.from(b64, "base64"));
    const cert = new X509Certificate(toArrayBuffer(der));

    if (!hasBIMIOID(cert)) return null;

    bimiData = await extractBIMIData(cert, der);
  } catch {
    // Parse/validation error — not a usable BIMI cert
    return null;
  }

  // Phase 2: Database operations. Errors here indicate infrastructure problems
  // (DB down, connection refused, etc.) and must propagate to the caller.
  const notability = await scoreNotability(bimiData.subjectOrg, bimiData.sanList, bimiData.subjectCountry);

  const [inserted] = await db
    .insert(certificates)
    .values({
      ...buildCertInsertValues(bimiData, {
        isPrecert: false,
        discoverySource: source,
      }),
      notabilityScore: notability?.score,
      notabilityReason: notability?.reason,
      companyDescription: notability?.description,
    })
    .onConflictDoNothing({ target: certificates.fingerprintSha256 })
    .returning({ fingerprintSha256: certificates.fingerprintSha256 });

  if (inserted) {
    // Mark any matching precerts as superseded
    await db
      .update(certificates)
      .set({ isSuperseded: true })
      .where(
        and(
          eq(certificates.serialNumber, bimiData.serialNumber),
          eq(certificates.isPrecert, true),
          eq(certificates.isSuperseded, false),
        ),
      );
  }

  return inserted?.fingerprintSha256 ?? null;
}
