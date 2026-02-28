import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { certificates, chainCerts, certificateChainLinks, domainBimiState } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { resolveCertParam } from "@/lib/db/filters";
import { extractDnField, pemToDer } from "@/lib/ct/parser";
import { X509Certificate } from "@peculiar/x509";
import { log } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIP(request);
  const rl = checkRateLimit(`cert-detail:${ip}`, { windowMs: 60_000, max: 120 });
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const { id: rawId } = await params;

  try {
    const { id: certId, error } = await resolveCertParam(rawId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });
    if (!certId) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.id, certId))
      .limit(1);

    if (!cert) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    // Fetch the paired precert/final cert (same serial number, different isPrecert)
    const [pairedCert] = await db
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
          cert.isPrecert
            ? eq(certificates.isPrecert, false)
            : sql`${certificates.isPrecert} = true`
        )
      )
      .limit(1);

    // Fetch chain by joining links -> chain_certs
    const chainRaw = await db
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
      .orderBy(certificateChainLinks.chainPosition);

    // Enrich chain certs with serial numbers and org names parsed from PEM
    const chain = chainRaw.map((c) => {
      let serialNumber: string | null = null;
      let subjectOrg: string | null = null;
      let issuerOrg: string | null = null;
      try {
        const der = pemToDer(c.rawPem);
        const x509 = new X509Certificate(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
        serialNumber = x509.serialNumber;
        subjectOrg = extractDnField(x509.subject, "O");
        issuerOrg = extractDnField(x509.issuer, "O");
      } catch { /* best-effort */ }
      return { ...c, serialNumber, subjectOrg, issuerOrg };
    });

    // Fetch BIMI state for associated domains
    const domains = cert.sanList.length > 0 ? cert.sanList : cert.subjectCn ? [cert.subjectCn] : [];
    let bimiStates: typeof domainBimiState.$inferSelect[] = [];
    if (domains.length > 0) {
      bimiStates = await db
        .select()
        .from(domainBimiState)
        .where(inArray(domainBimiState.domain, domains));
    }

    // Count other certs per SAN (excluding current cert and its precert pair)
    let sanCertCounts: Record<string, number> = {};
    try {
      const excludeIds = [certId, ...(pairedCert ? [pairedCert.id] : [])];
      if (domains.length > 0) {
        const result = await db.execute(sql`
          SELECT s AS san, count(DISTINCT serial_number)::int AS cnt
          FROM certificates, unnest(san_list) AS s
          WHERE s IN (${sql.join(domains.map(d => sql`${d}`), sql`, `)})
            AND id NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})
          GROUP BY s
        `);
        for (const r of result.rows) {
          if (r.san != null) {
            sanCertCounts[r.san as string] = r.cnt as number;
          }
        }
      }
    } catch (err) {
      log('warn', 'certificate-detail.san-counts.failed', { error: String(err), certId });
    }

    return NextResponse.json({
      certificate: cert,
      pairedCert: pairedCert || null,
      chain,
      bimiStates,
      sanCertCounts,
    }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    log('error', 'certificate-detail.api.failed', { error: String(error), route: '/api/certificates/[id]' });
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
