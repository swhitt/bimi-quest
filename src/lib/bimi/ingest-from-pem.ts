import { X509Certificate } from "@peculiar/x509";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { extractBIMIData, hasBIMIOID } from "@/lib/ct/parser";
import { normalizeIssuerOrg } from "@/lib/ca-display";
import { scoreNotability } from "@/lib/notability";

/**
 * Ingest a BIMI certificate from raw PEM into the database.
 * Used when a user validates a domain and we discover a cert not already in our DB.
 * Returns the fingerprint if inserted, null if already existed or not a BIMI cert.
 */
export async function ingestFromPem(
  pem: string,
  source: string = "validation"
): Promise<string | null> {
  try {
    const b64 = pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const der = new Uint8Array(Buffer.from(b64, "base64"));
    const cert = new X509Certificate(
      der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
    );

    if (!hasBIMIOID(cert)) return null;

    const bimiData = await extractBIMIData(cert, der);

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
        sanList: bimiData.sanList,
        markType: bimiData.markType,
        certType: bimiData.certType,
        logotypeSvgHash: bimiData.logotypeSvgHash,
        logotypeSvg: bimiData.logotypeSvg,
        rawPem: bimiData.rawPem,
        isPrecert: false,
        extensionsJson: bimiData.extensionsJson,
        notabilityScore: notability?.score,
        notabilityReason: notability?.reason,
        companyDescription: notability?.description,
        rootCaOrg: normalizeIssuerOrg(bimiData.issuerOrg),
        discoverySource: source,
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
            eq(certificates.isSuperseded, false)
          )
        );
    }

    return inserted?.fingerprintSha256 ?? null;
  } catch (err) {
    console.error("ingestFromPem failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
