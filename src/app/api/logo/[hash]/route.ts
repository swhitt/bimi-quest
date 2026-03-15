import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { logos } from "@/lib/db/schema";
import { sanitizeSvgForProxy } from "@/lib/sanitize-svg";

const PNG_SIZE = 256;

export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const [logo] = await db.select({ svgContent: logos.svgContent }).from(logos).where(eq(logos.svgHash, hash)).limit(1);

  if (!logo?.svgContent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "svg") {
    return new NextResponse(sanitizeSvgForProxy(logo.svgContent), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": CACHE_PRESETS.IMMUTABLE,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const png = await sharp(Buffer.from(logo.svgContent)).resize(PNG_SIZE, PNG_SIZE).png().toBuffer();

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
