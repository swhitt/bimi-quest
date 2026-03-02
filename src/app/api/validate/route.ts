import { type NextRequest, NextResponse } from "next/server";
import { ingestFromPem } from "@/lib/bimi/ingest-from-pem";
import { validateDomain } from "@/lib/bimi/validate";
import { log } from "@/lib/logger";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`validate:${ip}`, { windowMs: 60_000, max: 10 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  try {
    const body = await request.json();
    let domain: string = body.domain?.trim().toLowerCase();

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    // Accept email addresses by extracting the domain part
    if (domain.includes("@")) {
      domain = domain.split("@").pop() || "";
    }

    // Domain format validation: max 253 chars, each label checked individually to avoid ReDoS
    if (domain.length > 253) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }
    const labels = domain.split(".");
    const labelPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (labels.length < 2 || labels.some((l) => l.length === 0 || l.length > 63 || !labelPattern.test(l))) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const selector: string = body.selector?.trim().toLowerCase() || "default";
    const result = await validateDomain(domain, selector);

    // If we found a valid cert, try to ingest it (fire-and-forget)
    if (result.certificate.found && result.certificate.rawPem) {
      ingestFromPem(result.certificate.rawPem, "validation").catch((err) => console.warn("ingestFromPem failed:", err));
    }

    // Strip rawPem from the response (internal use only)
    const { rawPem: _, ...certWithoutPem } = result.certificate;
    return NextResponse.json({ ...result, certificate: certWithoutPem }, { headers: rl.headers });
  } catch (error) {
    log("error", "validate.api.failed", { error: String(error), route: "/api/validate" });
    return NextResponse.json({ error: "Validation failed" }, { status: 500, headers: rl.headers });
  }
}
