import { NextRequest, NextResponse } from "next/server";
import { CACHE_PRESETS } from "@/lib/cache";
import { TIMERS, getTimersByKind, type TimerKind } from "@/lib/timers";

/**
 * GET /api/timers
 *
 * Returns the full catalogue of timers in the BIMI Quest ecosystem.
 * External apps can poll this to build a live dashboard of running timers.
 *
 * Query params:
 *   kind  - filter by timer kind: "cron" | "worker" | "client"
 */
export function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") as TimerKind | null;

  const timers =
    kind && ["cron", "worker", "client"].includes(kind)
      ? getTimersByKind(kind)
      : TIMERS;

  return NextResponse.json(
    {
      timers,
      count: timers.length,
      kinds: ["cron", "worker", "client"],
      _links: {
        self: "/api/timers",
        health: "/api/health",
      },
    },
    {
      headers: { "Cache-Control": CACHE_PRESETS.SHORT },
    },
  );
}
