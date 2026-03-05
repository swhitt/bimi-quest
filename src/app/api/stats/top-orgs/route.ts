import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchTopOrgs } from "@/lib/data/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 15));

  try {
    const result = await fetchTopOrgs(params, { page, limit });

    return NextResponse.json(
      { data: result.data, pagination: { page, totalPages: result.totalPages } },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(error, "top-orgs.api.failed", "/api/stats/top-orgs", "Failed to fetch top organizations");
  }
}
