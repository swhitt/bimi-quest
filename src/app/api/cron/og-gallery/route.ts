import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ogCache } from "@/lib/db/schema";
import { generateMosaic } from "@/lib/og/mosaic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const png = await generateMosaic();
  const base64 = png.toString("base64");

  await db
    .insert(ogCache)
    .values({ key: "gallery-mosaic", png: base64 })
    .onConflictDoUpdate({
      target: ogCache.key,
      set: { png: base64, generatedAt: new Date() },
    });

  return NextResponse.json({ ok: true, size: png.length });
}
