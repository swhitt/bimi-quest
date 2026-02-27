import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certificates } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import sharp from "sharp";

const PNG_SIZE = 256;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;

  const [cert] = await db
    .select({ logotypeSvg: certificates.logotypeSvg })
    .from(certificates)
    .where(
      and(
        eq(certificates.logotypeSvgHash, hash),
        isNotNull(certificates.logotypeSvg),
      )
    )
    .limit(1);

  if (!cert?.logotypeSvg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "svg") {
    return new NextResponse(cert.logotypeSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const png = await sharp(Buffer.from(cert.logotypeSvg))
    .resize(PNG_SIZE, PNG_SIZE)
    .png()
    .toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
