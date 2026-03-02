import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";
import { log } from "@/lib/logger";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export async function GET() {
  const headers = { "Cache-Control": CACHE_PRESETS.SHORT };

  try {
    const [cursor] = await db
      .select({
        lastIndex: ingestionCursors.lastIndex,
        lastRun: ingestionCursors.lastRun,
        treeSize: ingestionCursors.treeSize,
      })
      .from(ingestionCursors)
      .where(eq(ingestionCursors.logName, "gorgon"))
      .limit(1);

    const now = Date.now();
    const lastRun = cursor?.lastRun?.toISOString() ?? null;
    const lagMs = cursor?.lastRun ? now - cursor.lastRun.getTime() : null;
    const behindEntries = cursor?.treeSize != null ? cursor.treeSize - cursor.lastIndex : null;
    const stale = lagMs != null && lagMs > STALE_THRESHOLD_MS;

    const ingestion = { lastRun, lagMs, behindEntries };

    if (stale) {
      log("warn", "health.ingestion.stale", { lagMs, behindEntries });
      return NextResponse.json({ status: "degraded", db: "connected", ingestion }, { status: 503, headers });
    }

    return NextResponse.json({ status: "ok", db: "connected", ingestion }, { headers });
  } catch (error) {
    log("error", "health.check.failed", { error: String(error) });
    return NextResponse.json({ status: "degraded", db: "unreachable", ingestion: null }, { status: 503, headers });
  }
}
