import { NextRequest, NextResponse } from "next/server";
import { validateDomain } from "@/lib/bimi/validate";
import { ingestFromPem } from "@/lib/bimi/ingest-from-pem";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`validate:${ip}`, { windowMs: 60_000, max: 10 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  try {
    const body = await request.json();
    let domain: string = body.domain?.trim().toLowerCase();

    if (!domain) {
      return NextResponse.json(
        { error: "Domain is required" },
        { status: 400 }
      );
    }

    // Accept email addresses by extracting the domain part
    if (domain.includes("@")) {
      domain = domain.split("@").pop() || "";
    }

    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 }
      );
    }

    const selector: string = body.selector?.trim().toLowerCase() || "default";
    const result = await validateDomain(domain, selector);

    // If we found a valid cert, try to ingest it (fire-and-forget)
    if (result.certificate.found && result.certificate.rawPem) {
      ingestFromPem(result.certificate.rawPem, "validation").catch((err) => console.warn("ingestFromPem failed:", err));
    }

    // Strip rawPem from the response (internal use only)
    const { rawPem: _, ...certWithoutPem } = result.certificate;
    return NextResponse.json(
      { ...result, certificate: certWithoutPem },
      { headers: rl.headers }
    );
  } catch (error) {
    log('error', 'validate.api.failed', { error: String(error), route: '/api/validate' });
    return NextResponse.json(
      { error: "Validation failed" },
      { status: 500, headers: rl.headers }
    );
  }
}
