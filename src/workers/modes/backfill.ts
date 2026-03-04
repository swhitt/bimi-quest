import { eq } from "drizzle-orm";
import { getSTH } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";

export async function backfill() {
  console.log("Starting backfill mode...");
  const sth = await getSTH();
  console.log(`Gorgon tree size: ${sth.tree_size.toLocaleString()}`);

  const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
  const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

  console.log(`Resuming from index ${startIndex.toLocaleString()}`);
  const result = await processIngestBatch({
    startIndex,
    endIndex: sth.tree_size,
    notify: false,
    onProgress: (msg) => process.stdout.write(`\r  ${msg}`),
  });
  console.log(`\nBackfill complete. Found ${result.certsFound} BIMI certificates.`);
}
