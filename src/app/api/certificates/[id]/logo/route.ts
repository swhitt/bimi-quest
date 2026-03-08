import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { resolveOrError } from "@/lib/api-utils";
import { CACHE_PRESETS } from "@/lib/cache";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";

const PNG_SIZE = 256;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  const result = await resolveOrError(rawId);
  if (result instanceof NextResponse) return result;
  const certId = result;

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
    return new NextResponse(sanitizeSvg(cert.logotypeSvg), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": CACHE_PRESETS.IMMUTABLE,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Default: convert to PNG for broad compatibility (Discord, social previews, etc.)
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

/** Strip <script> elements and on* event attributes from SVG content */
function sanitizeSvg(svg: string): string {
  // Remove <script>...</script> blocks (including self-closing)
  let sanitized = svg.replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, "");
  sanitized = sanitized.replace(/<script\s*\/>/gi, "");
  // Remove on* event handler attributes (e.g. onclick, onload, onerror)
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return sanitized;
}
