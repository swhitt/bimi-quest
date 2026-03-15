import { X509Certificate } from "@peculiar/x509";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lookupBIMIRecord } from "@/lib/bimi/dns";
import { deriveCertType } from "@/lib/ct/parser";
import { db } from "@/lib/db";
import { extractSubjectAttribute } from "@/lib/x509/asn1";
import { certificates } from "@/lib/db/schema";
import { lintPem, summarize } from "@/lib/lint/lint";
import { log } from "@/lib/logger";
import { safeFetch } from "@/lib/net/safe-fetch";
import { pemToDer, toArrayBuffer } from "@/lib/pem";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";

const lintBodySchema = z.union([
  z.object({ pem: z.string().min(1).max(100_000) }),
  z.object({ fingerprint: z.string().min(1).max(128) }),
  z.object({ url: z.string().url().max(2048) }),
  z.object({ domain: z.string().min(1).max(253), selector: z.string().default("default") }),
]);

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`lint:${ip}`, { windowMs: 60_000, max: 20 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: rl.headers });
    }

    const parsed = lintBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide one of: pem, fingerprint, or url", details: parsed.error.issues },
        { status: 400, headers: rl.headers },
      );
    }

    let pem: string;
    const data = parsed.data;

    if ("pem" in data) {
      pem = data.pem;
    } else if ("fingerprint" in data) {
      const row = await db
        .select({ rawPem: certificates.rawPem })
        .from(certificates)
        .where(eq(certificates.fingerprintSha256, data.fingerprint))
        .limit(1);
      if (row.length === 0) {
        return NextResponse.json(
          { error: "Certificate not found for fingerprint" },
          { status: 404, headers: rl.headers },
        );
      }
      pem = row[0].rawPem;
    } else if ("url" in data) {
      const res = await safeFetch(data.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch PEM: HTTP ${res.status}` },
          { status: 422, headers: rl.headers },
        );
      }
      pem = await res.text();
    } else {
      const domain = data.domain
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .toLowerCase();
      if (!domain || domain.length > 253) {
        return NextResponse.json({ error: "Invalid domain name" }, { status: 400, headers: rl.headers });
      }
      const lookup = await lookupBIMIRecord(domain, data.selector);
      if (!lookup.record) {
        return NextResponse.json(
          { error: `No BIMI record found for ${data.selector}._bimi.${domain}` },
          { status: 404, headers: rl.headers },
        );
      }
      if (!lookup.record.authorityUrl) {
        return NextResponse.json(
          {
            error: "No certificate to lint — BIMI record has no authority URL (a= tag)",
            bimiRecord: {
              raw: lookup.record.raw,
              domain,
              selector: data.selector,
              logoUrl: lookup.record.logoUrl,
              authorityUrl: lookup.record.authorityUrl,
              declined: lookup.record.declined,
            },
          },
          { status: 422, headers: rl.headers },
        );
      }
      const res = await safeFetch(lookup.record.authorityUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch certificate from ${lookup.record.authorityUrl}: HTTP ${res.status}` },
          { status: 422, headers: rl.headers },
        );
      }
      pem = await res.text();
    }

    let results;
    let cert: X509Certificate;
    try {
      const der = pemToDer(pem);
      cert = new X509Certificate(toArrayBuffer(der));
      results = lintPem(pem);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse certificate";
      return NextResponse.json({ error: message }, { status: 400, headers: rl.headers });
    }
    const summary = summarize(results);

    const sans = cert.getExtension("2.5.29.17");
    let sanList: string[] = [];
    if (sans) {
      const raw = new TextDecoder("ascii", { fatal: false }).decode(new Uint8Array(sans.value));
      sanList = [...raw.matchAll(/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi)].map(
        (m) => m[0],
      );
    }

    const markType = extractSubjectAttribute(cert, "1.3.6.1.4.1.53087.1.13");
    const certMeta = {
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      certType: deriveCertType(markType),
      sanList,
    };

    return NextResponse.json({ results, summary, cert: certMeta }, { headers: rl.headers });
  } catch (err) {
    log("error", "Lint API error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: rl.headers });
  }
}
