import { NextRequest, NextResponse } from "next/server";
import { isPrivateHostname } from "@/lib/net/hostname";

// In-memory LRU cache for SVG content
const cache = new Map<string, { content: string; contentType: string; timestamp: number }>();
const CACHE_TTL = 86400_000; // 24 hours
const MAX_CACHE_SIZE = 500;
const MAX_SVG_SIZE = 1_048_576; // 1 MB

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  // Validate URL: HTTPS only, no private/internal hosts
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only HTTPS URLs are allowed" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400, headers: CORS_HEADERS });
  }

  if (isPrivateHostname(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Requests to private/internal hosts are not allowed" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new NextResponse(cached.content, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; bimi-intel/1.0; +https://bimi-intel.vercel.app)",
        Accept: "image/svg+xml, image/*",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // Reject early if content-length exceeds limit
    const declaredLength = Number(res.headers.get("content-length") || "0");
    if (declaredLength > MAX_SVG_SIZE) {
      return NextResponse.json(
        { error: `Response too large (${declaredLength} bytes, max ${MAX_SVG_SIZE})` },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const contentType = res.headers.get("content-type") || "image/svg+xml";

    // Basic SVG validation
    if (
      !contentType.includes("svg") &&
      !contentType.includes("xml") &&
      !contentType.includes("image")
    ) {
      return NextResponse.json(
        { error: "Response is not an SVG" },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // Read body in chunks, enforcing size limit even if content-length was missing/wrong
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: "No response body" },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SVG_SIZE) {
        reader.cancel();
        return NextResponse.json(
          { error: `Response too large (exceeded ${MAX_SVG_SIZE} bytes)` },
          { status: 502, headers: CORS_HEADERS }
        );
      }
      chunks.push(value);
    }

    const content = new TextDecoder().decode(Buffer.concat(chunks));

    // Verify it looks like SVG
    if (!content.includes("<svg") && !content.includes("<SVG")) {
      return NextResponse.json(
        { error: "Response does not appear to be SVG" },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // Cache the result (simple LRU: evict oldest when full)
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(url, { content, contentType: "image/svg+xml", timestamp: Date.now() });

    return new NextResponse(content, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("SVG proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch SVG" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
