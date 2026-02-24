import { NextRequest, NextResponse } from "next/server";

// In-memory LRU cache for SVG content
const cache = new Map<string, { content: string; contentType: string; timestamp: number }>();
const CACHE_TTL = 86400_000; // 24 hours
const MAX_CACHE_SIZE = 500;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new NextResponse(cached.content, {
      headers: {
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
        { status: 502 }
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
        { status: 502 }
      );
    }

    const content = await res.text();

    // Verify it looks like SVG
    if (!content.includes("<svg") && !content.includes("<SVG")) {
      return NextResponse.json(
        { error: "Response does not appear to be SVG" },
        { status: 502 }
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
      { status: 502 }
    );
  }
}
