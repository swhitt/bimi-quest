import { and, eq, isNotNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { sanitizeSvgForProxy } from "@/lib/sanitize-svg";

const PNG_SIZE = 256;

export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const [cert] = await db
    .select({ logotypeSvg: certificates.logotypeSvg })
    .from(certificates)
    .where(and(eq(certificates.logotypeSvgHash, hash), isNotNull(certificates.logotypeSvg)))
    .limit(1);

  if (!cert?.logotypeSvg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "svg") {
    return new NextResponse(sanitizeSvgForProxy(cert.logotypeSvg), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": CACHE_PRESETS.IMMUTABLE,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const png = await sharp(Buffer.from(cert.logotypeSvg)).resize(PNG_SIZE, PNG_SIZE).png().toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": CACHE_PRESETS.IMMUTABLE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to render image — the SVG may be malformed or unsupported" },
      { status: 422 },
    );
  }
}
