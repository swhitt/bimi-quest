import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchCertificates } from "@/lib/data/certificates";

const certificatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z
    .enum(["notBefore", "notAfter", "ctLogTimestamp", "subjectCn", "issuerOrg", "subjectOrg"])
    .default("notBefore"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const parsed = certificatesQuerySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    sort: params.get("sort") ?? undefined,
    dir: params.get("dir") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await fetchCertificates(params, parsed.data);

    return NextResponse.json(result, {
      headers: { "Cache-Control": CACHE_PRESETS.SHORT },
    });
  } catch (error) {
    return apiError(error, "certificates.api.failed", "/api/certificates", "Failed to fetch certificates");
  }
}
