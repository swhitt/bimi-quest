import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { ogCache } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const [cached] = await db
      .select({ png: ogCache.png })
      .from(ogCache)
      .where(eq(ogCache.key, "gallery-mosaic"))
      .limit(1);

    if (cached?.png) {
      const buf = Buffer.from(cached.png, "base64");
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": CACHE_PRESETS.LONG_STATIC,
        },
      });
    }
  } catch {
    // og_cache table missing or DB error — fall through to redirect
  }

  // Fallback to static default
  return NextResponse.redirect(new URL("/og-default.png", request.url), 302);
}
