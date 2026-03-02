import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * Standardized API error response handler.
 * Logs the error with a structured key and route, then returns a JSON 500 response.
 */
export function apiError(error: unknown, logKey: string, route: string, message = "Operation failed") {
  log("error", logKey, { error: String(error), route });
  return NextResponse.json({ error: message }, { status: 500 });
}
