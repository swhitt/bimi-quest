import { NextRequest, NextResponse } from "next/server";
import { validateDomain } from "@/lib/bimi/validate";

// In-memory rate limiter: IP -> array of request timestamps
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  // Discard entries outside the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent);
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);

  try {
    const body = await request.json();
    let domain: string = body.domain?.trim().toLowerCase();

    if (!domain) {
      return NextResponse.json(
        { error: "Domain is required" },
        { status: 400 }
      );
    }

    // Accept email addresses by extracting the domain part
    if (domain.includes("@")) {
      domain = domain.split("@").pop() || "";
    }

    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 }
      );
    }

    const result = await validateDomain(domain);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Validate API error:", error);
    return NextResponse.json(
      { error: "Validation failed" },
      { status: 500 }
    );
  }
}
