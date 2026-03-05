import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { resolveCertParam } from "@/lib/db/filters";
import { log } from "@/lib/logger";

/**
 * Standardized API error response handler.
 * Logs the error with a structured key and route, then returns a JSON error response.
 */
export function apiError(error: unknown, logKey: string, route: string, message = "Operation failed", status = 500) {
  const errorStr = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  log("error", logKey, { error: errorStr, route });
  return NextResponse.json({ error: message }, { status });
}

/**
 * Resolve a certificate URL param and return either a NextResponse error or the numeric cert ID.
 * Combines resolveCertParam + error/404 handling into a single call for API routes.
 */
export async function resolveOrError(rawId: string): Promise<NextResponse | number> {
  const { id, error } = await resolveCertParam(rawId);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  if (!id) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  return id;
}

/**
 * Verify a cron endpoint's Bearer token against CRON_SECRET using constant-time comparison.
 * Returns a 401/500 NextResponse on failure, or null if authentication succeeds.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  // Pad both buffers to the same length to avoid leaking secret length via timing
  const maxLen = Math.max(authHeader.length, expected.length);
  const authBuf = Buffer.alloc(maxLen);
  const expectedBuf = Buffer.alloc(maxLen);
  authBuf.write(authHeader);
  expectedBuf.write(expected);
  if (!timingSafeEqual(authBuf, expectedBuf) || authHeader.length !== expected.length) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
