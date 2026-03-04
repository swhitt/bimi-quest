import { NextResponse } from "next/server";
import { getSTH } from "@/lib/ct/gorgon";

const KNOWN_LOGS = new Set(["gorgon"]);

export async function GET(_request: Request, { params }: { params: Promise<{ log: string }> }) {
  const { log } = await params;
  if (!KNOWN_LOGS.has(log)) {
    return NextResponse.json({ error: "Unknown CT log" }, { status: 404 });
  }

  try {
    const sth = await getSTH();

    return NextResponse.json(sth, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch Signed Tree Head" }, { status: 502 });
  }
}
