import { X509Certificate } from "@peculiar/x509";
import { and, eq } from "drizzle-orm";
import { buildCertInsertValues } from "@/lib/ct/cert-values";
import { extractBIMIData, hasBIMIOID } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { scoreNotability } from "@/lib/notability";
import { toArrayBuffer } from "@/lib/pem";
import { errorMessage } from "@/lib/utils";

/**
 * Ingest a BIMI certificate from raw PEM into the database.
 * Used when a user validates a domain and we discover a cert not already in our DB.
 * Returns the fingerprint if inserted, null if already existed or not a BIMI cert.
 */
export async function ingestFromPem(pem: string, source: string = "validation"): Promise<string | null> {
  try {
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = new Uint8Array(Buffer.from(b64, "base64"));
    const cert = new X509Certificate(toArrayBuffer(der));

    if (!hasBIMIOID(cert)) return null;

    const bimiData = await extractBIMIData(cert, der);

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
  } catch (err) {
    console.error("ingestFromPem failed:", errorMessage(err));
    return null;
  }
}
