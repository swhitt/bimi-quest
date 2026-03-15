import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { resolveOrError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  const result = await resolveOrError(rawId);
  if (result instanceof NextResponse) return result;
  const certId = result;

  const [cert] = await db
    .select({ logotypeSvgHash: certificates.logotypeSvgHash })
    .from(certificates)
    .where(eq(certificates.id, certId))
    .limit(1);

  if (!cert?.logotypeSvgHash) {
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  }

  // Redirect to the canonical logo proxy
  const format = request.nextUrl.searchParams.get("format");
  const formatParam = format === "svg" ? "?format=svg" : "";
  return NextResponse.redirect(new URL(`/api/logo/${cert.logotypeSvgHash}${formatParam}`, request.url), {
    status: 302,
    headers: { "Cache-Control": CACHE_PRESETS.IMMUTABLE },
  });
}
