import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ogCache } from "@/lib/db/schema";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  // Try cached mosaic from DB
  const [cached] = await db
    .select({ png: ogCache.png })
    .from(ogCache)
    .where(eq(ogCache.key, "gallery-mosaic"))
    .limit(1);

  if (cached?.png) {
    const buf = Buffer.from(cached.png, "base64");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Fallback to default OG image
  try {
    const fallback = await readFile(join(process.cwd(), "public/og-default.png"));
    return new NextResponse(new Uint8Array(fallback), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
