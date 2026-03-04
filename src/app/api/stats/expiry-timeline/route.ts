import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchExpiryTimeline } from "@/lib/data/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const data = await fetchExpiryTimeline(params);

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(
      error,
      "expiry-timeline.api.failed",
      "/api/stats/expiry-timeline",
      "Failed to fetch expiry timeline",
    );
  }
}
