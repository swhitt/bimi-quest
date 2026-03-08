import { eq } from "drizzle-orm";
import { getSTH } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";

const BASE_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000; // 10 minutes

export async function stream() {
  console.log("Starting stream mode (polling every 30s)...");
  let consecutiveFailures = 0;

  while (true) {
    try {
      const sth = await getSTH();
      const cursor = await db.select().from(ingestionCursors).where(eq(ingestionCursors.logName, "gorgon")).limit(1);
      const startIndex = cursor.length > 0 ? Number(cursor[0].lastIndex) : 0;

      if (startIndex < sth.tree_size) {
        console.log(`New entries: ${startIndex.toLocaleString()} -> ${sth.tree_size.toLocaleString()}`);
        const result = await processIngestBatch({
          startIndex,
          endIndex: sth.tree_size,
          notify: true,
          onProgress: (msg) => process.stdout.write(`\r  ${msg}`),
        });
        if (result.certsFound > 0) {
          console.log(`Found ${result.certsFound} new BIMI certificate(s)`);
        }
        if (result.skippedIndexes.length > 0) {
          console.warn(
            `Permanently skipped ${result.skippedIndexes.length} entries: ${result.skippedIndexes.join(", ")}`,
          );
        }
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      const backoff = Math.min(BASE_POLL_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
      console.error(
        `Stream iteration error (failure #${consecutiveFailures}, next retry in ${Math.round(backoff / 1000)}s):`,
        err,
      );
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    await new Promise((r) => setTimeout(r, BASE_POLL_MS));
  }
}
