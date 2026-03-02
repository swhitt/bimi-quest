import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { resolveCertParam } from "@/lib/db/filters";
import { certificates } from "@/lib/db/schema";

const PNG_SIZE = 256;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  const { id: certId, error } = await resolveCertParam(rawId);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  if (!certId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [cert] = await db
    .select({ logotypeSvg: certificates.logotypeSvg })
    .from(certificates)
    .where(eq(certificates.id, certId))
    .limit(1);

  if (!cert?.logotypeSvg) {
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "svg") {
    return new NextResponse(cert.logotypeSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": CACHE_PRESETS.IMMUTABLE,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Default: convert to PNG for broad compatibility (Discord, social previews, etc.)
  const png = await sharp(Buffer.from(cert.logotypeSvg)).resize(PNG_SIZE, PNG_SIZE).png().toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": CACHE_PRESETS.IMMUTABLE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
