import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates, chainCerts, certificateChainLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveCertParam } from "@/lib/db/filters";
import { isPrivateHostname } from "@/lib/net/hostname";
import { safeFetch } from "@/lib/net/safe-fetch";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import {
  buildOcspRequest,
  parseOcspResponse,
  extractIssuerInfo,
  pemToDer,
  parseCrl,
  extractOcspUrl,
  extractCrlUrl,
  type OcspResult,
  type CrlResult,
} from "@/lib/x509/revocation";
import { log } from "@/lib/logger";

const MAX_CRL_SIZE = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT = 10_000; // 10s

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIP(_request);
  const rl = checkRateLimit(`revocation:${ip}`, { windowMs: 60_000, max: 20 });
  if (!rl.allowed) return rateLimitResponse(rl.headers);
  const { id: rawId } = await params;

  try {
    const { id: certId, error } = await resolveCertParam(rawId);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });
    if (!certId) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

    // Fetch the leaf cert
    const [cert] = await db
      .select({
        id: certificates.id,
        serialNumber: certificates.serialNumber,
        rawPem: certificates.rawPem,
        extensionsJson: certificates.extensionsJson,
      })
      .from(certificates)
      .where(eq(certificates.id, certId))
      .limit(1);

    if (!cert) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    // Fetch chain certs (position 1 = issuer)
    const chain = await db
      .select({
        chainPosition: certificateChainLinks.chainPosition,
        rawPem: chainCerts.rawPem,
      })
      .from(certificateChainLinks)
      .innerJoin(chainCerts, eq(certificateChainLinks.chainCertId, chainCerts.id))
      .where(eq(certificateChainLinks.leafCertId, certId))
      .orderBy(certificateChainLinks.chainPosition);

    const extensionsJson = (cert.extensionsJson ?? {}) as Record<string, string>;
    const ocspUrl = extractOcspUrl(extensionsJson);
    const crlUrl = extractCrlUrl(extensionsJson);

    const issuerPem = chain.find((c) => c.chainPosition === 1)?.rawPem ?? null;

    // Run OCSP and CRL checks in parallel
    const [ocspResult, crlResult] = await Promise.all([
      checkOcsp(ocspUrl, cert.rawPem, cert.serialNumber, issuerPem),
      checkCrl(crlUrl, cert.serialNumber),
    ]);

    return NextResponse.json(
      { ocsp: ocspResult, crl: crlResult },
      {
        headers: { ...rl.headers, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      }
    );
  } catch (err) {
    log('error', 'revocation.api.failed', { error: String(err), route: '/api/certificates/[id]/revocation' });
    return NextResponse.json(
      { error: "Failed to check revocation status" },
      { status: 500 }
    );
  }
}

async function checkOcsp(
  ocspUrl: string | null,
  _leafPem: string,
  serialNumberHex: string,
  issuerPem: string | null
): Promise<OcspResult | null> {
  if (!ocspUrl) return null;

  try {
    const parsed = new URL(ocspUrl);
    if (isPrivateHostname(parsed.hostname)) {
      return { url: ocspUrl, status: "error", errorMessage: "OCSP URL points to private network" };
    }
  } catch {
    return { url: ocspUrl, status: "error", errorMessage: "Invalid OCSP URL" };
  }

  if (!issuerPem) {
    return { url: ocspUrl, status: "error", errorMessage: "Issuer certificate not available (needed for OCSP)" };
  }

  try {
    // Extract issuer subject Name and SPKI from the issuer cert
    const { issuerNameDer, issuerPublicKeyDer } = extractIssuerInfo(issuerPem);

    const ocspReqDer = buildOcspRequest({
      issuerNameDer,
      issuerPublicKeyDer,
      serialNumberHex,
    });

    const response = await safeFetch(ocspUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/ocsp-request",
        Accept: "application/ocsp-response",
      },
      body: new Uint8Array(ocspReqDer).buffer as ArrayBuffer,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!response.ok) {
      return {
        url: ocspUrl,
        status: "error",
        errorMessage: `OCSP responder returned HTTP ${response.status}`,
      };
    }

    const responseData = new Uint8Array(await response.arrayBuffer());
    const result = parseOcspResponse(responseData);

    return {
      url: ocspUrl,
      status: result.status,
      thisUpdate: result.thisUpdate,
      nextUpdate: result.nextUpdate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { url: ocspUrl, status: "error", errorMessage: message };
  }
}

async function checkCrl(
  crlUrl: string | null,
  serialNumberHex: string
): Promise<CrlResult | null> {
  if (!crlUrl) return null;

  try {
    const parsed = new URL(crlUrl);
    if (isPrivateHostname(parsed.hostname)) {
      return { url: crlUrl, status: "error", errorMessage: "CRL URL points to private network" };
    }
  } catch {
    return { url: crlUrl, status: "error", errorMessage: "Invalid CRL URL" };
  }

  try {
    const response = await safeFetch(crlUrl, {
      headers: { Accept: "application/pkix-crl, application/x-pkcs7-crl" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!response.ok) {
      return {
        url: crlUrl,
        status: "error",
        errorMessage: `CRL server returned HTTP ${response.status}`,
      };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_CRL_SIZE) {
      return {
        url: crlUrl,
        status: "error",
        errorMessage: `CRL too large (${(parseInt(contentLength) / 1024 / 1024).toFixed(1)}MB, limit ${MAX_CRL_SIZE / 1024 / 1024}MB)`,
      };
    }

    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_CRL_SIZE) {
      return {
        url: crlUrl,
        status: "error",
        errorMessage: `CRL too large (${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB)`,
      };
    }

    const rawBytes = new Uint8Array(arrayBuf);

    // Detect PEM-encoded CRL and convert
    const textStart = new TextDecoder().decode(rawBytes.slice(0, 30));
    const derBytes = textStart.includes("-----BEGIN")
      ? pemToDer(new TextDecoder().decode(rawBytes))
      : rawBytes;

    const result = parseCrl(derBytes, serialNumberHex);

    return {
      url: crlUrl,
      status: result.revoked ? "revoked" : "good",
      thisUpdate: result.thisUpdate,
      nextUpdate: result.nextUpdate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { url: crlUrl, status: "error", errorMessage: message };
  }
}
