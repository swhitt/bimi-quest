import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";
import { getSTH } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";

// Vercel Pro allows up to 300s
export const maxDuration = 300;

// With 300s limit and ~1s per cert (Haiku scoring), we can handle ~40 batches
const MAX_BATCHES = 40;

export async function GET(request: NextRequest) {
  // Fail-closed: reject if CRON_SECRET is not configured
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sth = await getSTH();
    const treeSize = sth.tree_size;

    const cursor = await db
      .select()
      .from(ingestionCursors)
      .where(eq(ingestionCursors.logName, "gorgon"))
      .limit(1);
    const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

    if (startIndex >= treeSize) {
      return NextResponse.json({
        status: "up-to-date",
        treeSize,
        cursor: startIndex,
      });
    }

    const behind = treeSize - startIndex;

    const result = await processIngestBatch({
      startIndex,
      endIndex: treeSize,
      maxBatches: MAX_BATCHES,
      notify: true,
      onProgress: (msg) => console.log(`[cron/ingest] ${msg}`),
    });

    return NextResponse.json({
      status: "synced",
      treeSize,
      previousCursor: startIndex,
      newCursor: result.lastIndex,
      behind,
      entriesProcessed: result.lastIndex - startIndex,
      certsFound: result.certsFound,
      batchesRun: result.batchesRun,
    });
  } catch (error) {
    console.error("Cron ingest error:", error);
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 500 }
    );
  }
}
