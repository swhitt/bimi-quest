import { NextResponse } from "next/server";
import { CACHE_PRESETS } from "@/lib/cache";
import { getSTH } from "@/lib/ct/gorgon";

export async function GET() {
  try {
    const sth = await getSTH();
    return NextResponse.json(sth, {
      headers: { "Cache-Control": CACHE_PRESETS.SHORT },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch Signed Tree Head" }, { status: 502 });
  }
}
