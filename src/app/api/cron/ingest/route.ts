import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, verifyCronAuth } from "@/lib/api-utils";
import { getSTH } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";

// Vercel Pro allows up to 300s
export const maxDuration = 300;

// With 300s limit and ~1s per cert (Haiku scoring), we can handle ~40 batches
const MAX_BATCHES = 40;

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const sth = await getSTH();
    const treeSize = sth.tree_size;

    const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
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
    return apiError(error, "cron.ingest.failed", "/api/cron/ingest", "Ingestion failed");
  }
}
