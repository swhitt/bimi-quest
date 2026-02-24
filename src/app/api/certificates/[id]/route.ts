import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, certificateChains, domainBimiState } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

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

    // Fetch chain
    const chain = await db
      .select()
      .from(certificateChains)
      .where(eq(certificateChains.leafCertId, certId))
      .orderBy(certificateChains.chainPosition);

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
      chain,
      bimiStates,
    });
  } catch (error) {
    console.error("Certificate detail API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
