import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestionCursors } from "@/lib/db/schema";
import { CtLogStatus } from "./ct-log-status";

const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;

async function getLastChecked(): Promise<{ logName: string; lastRun: Date } | null> {
  try {
    const [row] = await db
      .select({ logName: ingestionCursors.logName, lastRun: ingestionCursors.lastRun })
      .from(ingestionCursors)
      .orderBy(desc(ingestionCursors.lastRun))
      .limit(1);
    if (row?.lastRun) return { logName: row.logName, lastRun: row.lastRun };
    return null;
  } catch {
    return null;
  }
}

export async function Footer() {
  const lastChecked = await getLastChecked();

  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-3 sm:px-4 py-3 text-sm text-muted-foreground">
        <p>
          Data sourced from public{" "}
          <a
            href="https://certificate.transparency.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Certificate Transparency
          </a>{" "}
          logs.
          {commitSha && (
            <span className="ml-2 text-[10px] opacity-40 font-mono" title={commitSha}>
              {commitSha.slice(0, 7)}
            </span>
          )}
        </p>
        <nav className="flex items-center gap-4">
          {lastChecked && <CtLogStatus logName={lastChecked.logName} lastChecked={lastChecked.lastRun.toISOString()} />}
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/api/feed" className="hover:text-foreground transition-colors">
            RSS
          </Link>
        </nav>
      </div>
    </footer>
  );
}
