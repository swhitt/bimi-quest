import { NextResponse } from "next/server";

export const runtime = "edge";

/** Redirect to the static default OG image. */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/og-default.png", request.url), 302);
}
