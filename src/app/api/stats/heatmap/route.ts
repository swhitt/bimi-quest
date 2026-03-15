import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchHeatmapData } from "@/lib/data/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const result = await fetchHeatmapData(params);

    return NextResponse.json(result, {
      headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
    });
  } catch (error) {
    return apiError(error, "heatmap.api.failed", "/api/stats/heatmap", "Failed to fetch heatmap data");
  }
}
