import { X509Certificate } from "@peculiar/x509";
import { and, eq, inArray, sql } from "drizzle-orm";
import { extractDnField, pemToDer } from "@/lib/ct/parser";
import { log } from "@/lib/logger";
import { toArrayBuffer } from "@/lib/pem";
import { db } from "./index";
import { certificateChainLinks, certificates, chainCerts, domainBimiState } from "./schema";

/**
 * Fetch full certificate detail by numeric ID.
 * Shared between the API route and the server component page.
 */
export async function fetchCertificateDetail(certId: number) {
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, certId)).limit(1);

  if (!cert) return null;

  const domains = cert.sanList.length > 0 ? cert.sanList : cert.subjectCn ? [cert.subjectCn] : [];

  const [pairedCert, chainRaw, bimiStates, sanCountResult] = await Promise.all([
    // Paired precert/final cert (same serial number, different isPrecert)
    db
      .select({
        id: certificates.id,
        isPrecert: certificates.isPrecert,
        fingerprintSha256: certificates.fingerprintSha256,
        ctLogIndex: certificates.ctLogIndex,
        ctLogTimestamp: certificates.ctLogTimestamp,
        extensionsJson: certificates.extensionsJson,
      })
      .from(certificates)
      .where(
        and(
          eq(certificates.serialNumber, cert.serialNumber),
          eq(certificates.issuerDn, cert.issuerDn),
          cert.isPrecert ? eq(certificates.isPrecert, false) : sql`${certificates.isPrecert} = true`,
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),

    // Chain by joining links -> chain_certs
    db
      .select({
        id: chainCerts.id,
        chainPosition: certificateChainLinks.chainPosition,
        fingerprintSha256: chainCerts.fingerprintSha256,
        subjectDn: chainCerts.subjectDn,
        issuerDn: chainCerts.issuerDn,
        rawPem: chainCerts.rawPem,
        notBefore: chainCerts.notBefore,
        notAfter: chainCerts.notAfter,
      })
      .from(certificateChainLinks)
      .innerJoin(chainCerts, eq(certificateChainLinks.chainCertId, chainCerts.id))
      .where(eq(certificateChainLinks.leafCertId, certId))
      .orderBy(certificateChainLinks.chainPosition),

    // BIMI state for associated domains
    domains.length > 0
      ? db.select().from(domainBimiState).where(inArray(domainBimiState.domain, domains))
      : Promise.resolve([] as (typeof domainBimiState.$inferSelect)[]),

    // Count other certs per SAN (excluding current cert)
    domains.length > 0
      ? db
          .execute(
            sql`
            SELECT s AS san, count(DISTINCT serial_number)::int AS cnt
            FROM certificates, unnest(san_list) AS s
            WHERE s IN (${sql.join(
              domains.map((d) => sql`${d}`),
              sql`, `,
            )})
              AND NOT (serial_number = ${cert.serialNumber} AND issuer_dn = ${cert.issuerDn})
            GROUP BY s
          `,
          )
          .catch((err) => {
            log("warn", "certificate-detail.san-counts.failed", { error: String(err), certId });
            return { rows: [] as Record<string, unknown>[] };
          })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  // Enrich chain certs with serial numbers and org names parsed from PEM
  const chain = chainRaw.map((c) => {
    let serialNumber: string | null = null;
    let subjectOrg: string | null = null;
    let issuerOrg: string | null = null;
    try {
      const der = pemToDer(c.rawPem);
      const x509 = new X509Certificate(toArrayBuffer(der));
      serialNumber = x509.serialNumber;
      subjectOrg = extractDnField(x509.subject, "O");
      issuerOrg = extractDnField(x509.issuer, "O");
    } catch {
      /* best-effort */
    }
    return { ...c, serialNumber, subjectOrg, issuerOrg };
  });

  // Build sanCertCounts from parallel query result
  const sanCertCounts: Record<string, number> = {};
  for (const r of sanCountResult.rows) {
    if (r.san != null) {
      sanCertCounts[r.san as string] = r.cnt as number;
    }
  }

  return {
    certificate: cert,
    pairedCert: pairedCert || null,
    chain,
    bimiStates,
    sanCertCounts,
  };
}
