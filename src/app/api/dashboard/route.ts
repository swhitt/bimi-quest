import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { fetchDashboardData } from "@/lib/data/dashboard";
import { serverTiming } from "@/lib/server-timing";

const dashboardQuerySchema = z.object({
  ca: z.string().optional(),
  root: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const parsed = dashboardQuerySchema.safeParse({
    ca: searchParams.get("ca") ?? undefined,
    root: searchParams.get("root") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.issues }, { status: 400 });
  }

  const timing = serverTiming();
  try {
    const data = await fetchDashboardData(searchParams);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": CACHE_PRESETS.SHORT,
        "Server-Timing": timing.header("db"),
      },
    });
  } catch (error) {
    return apiError(error, "dashboard.api.failed", "/api/dashboard", "Failed to fetch dashboard data");
  }
}
