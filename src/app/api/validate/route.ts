import { NextRequest, NextResponse } from "next/server";
import { validateDomain } from "@/lib/bimi/validate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const domain = body.domain?.trim().toLowerCase();

    if (!domain) {
      return NextResponse.json(
        { error: "Domain is required" },
        { status: 400 }
      );
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
