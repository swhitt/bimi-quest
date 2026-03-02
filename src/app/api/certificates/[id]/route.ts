import { X509Certificate } from "@peculiar/x509";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { extractDnField, pemToDer } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { resolveCertParam } from "@/lib/db/filters";
import { certificateChainLinks, certificates, chainCerts, domainBimiState } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { toArrayBuffer } from "@/lib/pem";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { serverTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`cert-detail:${ip}`, { windowMs: 60_000, max: 120 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const { id: rawId } = await params;

  const timing = serverTiming();
  try {
    const { id: certId, error } = await resolveCertParam(rawId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });
    if (!certId) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certId)).limit(1);

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
          cert.isPrecert ? eq(certificates.isPrecert, false) : sql`${certificates.isPrecert} = true`,
        ),
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
        const x509 = new X509Certificate(toArrayBuffer(der));
        serialNumber = x509.serialNumber;
        subjectOrg = extractDnField(x509.subject, "O");
        issuerOrg = extractDnField(x509.issuer, "O");
      } catch {
        /* best-effort */
      }
      return { ...c, serialNumber, subjectOrg, issuerOrg };
    });

    // Fetch BIMI state for associated domains
    const domains = cert.sanList.length > 0 ? cert.sanList : cert.subjectCn ? [cert.subjectCn] : [];
    let bimiStates: (typeof domainBimiState.$inferSelect)[] = [];
    if (domains.length > 0) {
      bimiStates = await db.select().from(domainBimiState).where(inArray(domainBimiState.domain, domains));
    }

    // Count other certs per SAN (excluding current cert and its precert pair)
    const sanCertCounts: Record<string, number> = {};
    try {
      const excludeIds = [certId, ...(pairedCert ? [pairedCert.id] : [])];
      if (domains.length > 0) {
        const result = await db.execute(sql`
          SELECT s AS san, count(DISTINCT serial_number)::int AS cnt
          FROM certificates, unnest(san_list) AS s
          WHERE s IN (${sql.join(
            domains.map((d) => sql`${d}`),
            sql`, `,
          )})
            AND id NOT IN (${sql.join(
              excludeIds.map((id) => sql`${id}`),
              sql`, `,
            )})
          GROUP BY s
        `);
        for (const r of result.rows) {
          if (r.san != null) {
            sanCertCounts[r.san as string] = r.cnt as number;
          }
        }
      }
    } catch (err) {
      log("warn", "certificate-detail.san-counts.failed", { error: String(err), certId });
    }

    return NextResponse.json(
      {
        certificate: cert,
        pairedCert: pairedCert || null,
        chain,
        bimiStates,
        sanCertCounts,
      },
      {
        headers: {
          "Cache-Control": CACHE_PRESETS.MEDIUM,
          "Server-Timing": timing.header("db"),
        },
      },
    );
  } catch (error) {
    return apiError(error, "certificate-detail.api.failed", "/api/certificates/[id]", "Failed to fetch certificate");
  }
}
