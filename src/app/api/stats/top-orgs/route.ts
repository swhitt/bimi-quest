import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchTopOrgs } from "@/lib/data/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const data = await fetchTopOrgs(params);

    return NextResponse.json(
      { data },
      {
        headers: { "Cache-Control": CACHE_PRESETS.MEDIUM },
      },
    );
  } catch (error) {
    return apiError(error, "top-orgs.api.failed", "/api/stats/top-orgs", "Failed to fetch top organizations");
  }
}
