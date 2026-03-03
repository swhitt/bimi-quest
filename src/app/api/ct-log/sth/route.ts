import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CACHE_PRESETS } from "@/lib/cache";
import { getSTH } from "@/lib/ct/gorgon";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";

export async function GET() {
  try {
    const [sth, lastRunRow] = await Promise.all([
      getSTH(),
      db
        .select({ lastRun: ingestionCursors.lastRun })
        .from(ingestionCursors)
        .orderBy(desc(ingestionCursors.lastRun))
        .limit(1),
    ]);

    return NextResponse.json(
      {
        ...sth,
        lastChecked: lastRunRow[0]?.lastRun?.toISOString() ?? null,
      },
      {
        headers: { "Cache-Control": CACHE_PRESETS.SHORT },
      },
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch Signed Tree Head" }, { status: 502 });
  }
}
