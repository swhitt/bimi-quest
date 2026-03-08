import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchDmarcPolicyDistribution } from "@/lib/data/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const data = await fetchDmarcPolicyDistribution(params);

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch (error) {
    return apiError(
      error,
      "dmarc-policy.api.failed",
      "/api/stats/dmarc-policy",
      "Failed to fetch DMARC policy distribution",
    );
  }
}
