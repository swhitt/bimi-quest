import { eq } from "drizzle-orm";
import { getSTH } from "@/lib/ct/gorgon";
import { processIngestBatch } from "@/lib/ct/ingest-batch";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";

export async function stream() {
  console.log("Starting stream mode (polling every 30s)...");
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
      }
    } catch (err) {
      console.error("Stream iteration error:", err);
    }

    await new Promise((r) => setTimeout(r, 30_000));
  }
}
