import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, chainCerts, certificateChainLinks, domainBimiState } from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const certId = parseInt(id);

  if (isNaN(certId)) {
    return NextResponse.json({ error: "Invalid certificate ID" }, { status: 400 });
  }

  try {
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
          ne(certificates.id, certId)
        )
      )
      .limit(1);

    // Fetch chain by joining links -> chain_certs
    const chain = await db
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

    // Fetch BIMI state for associated domains
    const domains = cert.sanList.length > 0 ? cert.sanList : cert.subjectCn ? [cert.subjectCn] : [];
    let bimiStates: typeof domainBimiState.$inferSelect[] = [];
    if (domains.length > 0) {
      bimiStates = await db
        .select()
        .from(domainBimiState)
        .where(inArray(domainBimiState.domain, domains));
    }

    return NextResponse.json({
      certificate: cert,
      pairedCert: pairedCert || null,
      chain,
      bimiStates,
    }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Certificate detail API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
