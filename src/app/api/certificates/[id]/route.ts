import { type NextRequest, NextResponse } from "next/server";
import { apiError, resolveOrError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchCertificateDetail } from "@/lib/db/certificate-detail";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { serverTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`cert-detail:${ip}`, { windowMs: 60_000, max: 120 }, request);
  if (!rl.allowed) return rateLimitResponse(rl.headers);

  const { id: rawId } = await params;

  const timing = serverTiming();
  try {
    const result = await resolveOrError(rawId);
    if (result instanceof NextResponse) return result;
    const certId = result;

    const data = await fetchCertificateDetail(certId);
    if (!data) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": CACHE_PRESETS.MEDIUM,
        "Server-Timing": timing.header("db"),
      },
    });
  } catch (error) {
    return apiError(error, "certificate-detail.api.failed", "/api/certificates/[id]", "Failed to fetch certificate");
  }
}
