import { type NextRequest, NextResponse } from "next/server";
import { safeFetch } from "@/lib/net/safe-fetch";
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

// In-memory LRU cache for SVG content
const cache = new Map<string, { content: string; contentType: string; timestamp: number }>();
const CACHE_TTL = 86400_000; // 24 hours
const MAX_CACHE_SIZE = 500;
const MAX_SVG_SIZE = 1_048_576; // 1 MB

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request);
  const rl = await checkRateLimit(`svg-proxy:${ip}`, { windowMs: 60_000, max: 30 }, request);
  if (!rl.allowed) return rateLimitResponse({ ...corsHeaders(request), ...rl.headers });

  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400, headers: rl.headers });
  }

  // Validate URL: HTTPS only
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only HTTPS URLs are allowed" },
        { status: 400, headers: { ...corsHeaders(request), ...rl.headers } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid URL" },
      { status: 400, headers: { ...corsHeaders(request), ...rl.headers } },
    );
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new NextResponse(cached.content, {
      headers: {
        ...corsHeaders(request),
        ...rl.headers,
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; bimi-quest/1.0; +https://bimi.quest)",
        Accept: "image/svg+xml, image/*",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502, headers: corsHeaders(request) },
      );
    }

    // Reject early if content-length exceeds limit
    const declaredLength = Number(res.headers.get("content-length") || "0");
    if (declaredLength > MAX_SVG_SIZE) {
      return NextResponse.json(
        { error: `Response too large (${declaredLength} bytes, max ${MAX_SVG_SIZE})` },
        { status: 502, headers: corsHeaders(request) },
      );
    }

    const contentType = res.headers.get("content-type") || "image/svg+xml";

    // Basic SVG validation
    if (!contentType.includes("svg") && !contentType.includes("xml") && !contentType.includes("image")) {
      return NextResponse.json({ error: "Response is not an SVG" }, { status: 502, headers: corsHeaders(request) });
    }

    // Read body in chunks, enforcing size limit even if content-length was missing/wrong
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No response body" }, { status: 502, headers: corsHeaders(request) });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SVG_SIZE) {
        reader.cancel();
        return NextResponse.json(
          { error: `Response too large (exceeded ${MAX_SVG_SIZE} bytes)` },
          { status: 502, headers: corsHeaders(request) },
        );
      }
      chunks.push(value);
    }

    const content = new TextDecoder().decode(Buffer.concat(chunks));

    // Verify it looks like SVG
    if (!content.includes("<svg") && !content.includes("<SVG")) {
      return NextResponse.json(
        { error: "Response does not appear to be SVG" },
        { status: 502, headers: corsHeaders(request) },
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
        ...corsHeaders(request),
        ...rl.headers,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log("error", "svg-proxy.api.failed", { error: String(error), route: "/api/proxy/svg" });
    return NextResponse.json(
      { error: "Failed to fetch SVG" },
      { status: 502, headers: { ...corsHeaders(request), ...rl.headers } },
    );
  }
}
