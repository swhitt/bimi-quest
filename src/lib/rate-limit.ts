import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * In-memory per-instance rate limiter with standard rate limit headers.
 *
 * On Vercel, each serverless function instance maintains its own map, so limits
 * are per-instance rather than global. This still provides meaningful throttling
 * since warm instances handle sequential requests for several minutes, and the
 * per-instance ceiling prevents any single caller from monopolizing a warm instance.
 *
 * For true distributed rate limiting, swap this for a Redis/DB-backed counter.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent unbounded memory growth
const CLEANUP_INTERVAL = 300_000; // 5 min
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  headers: Record<string, string>;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  cleanup(config.windowMs);

  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  const remaining = Math.max(0, config.max - entry.timestamps.length);
  const resetMs =
    entry.timestamps.length > 0
      ? entry.timestamps[0] + config.windowMs
      : now + config.windowMs;

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.max),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
  };

  if (entry.timestamps.length >= config.max) {
    headers["Retry-After"] = String(
      Math.ceil((resetMs - now) / 1000)
    );
    store.set(key, entry);
    log("warn", "rate_limit.exceeded", { key, max: config.max, windowMs: config.windowMs });
    return { allowed: false, remaining: 0, resetMs, headers };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return { allowed: true, remaining: remaining - 1, resetMs, headers };
}

/**
 * Extract client IP from the request.
 * On Vercel, the leftmost X-Forwarded-For entry is the client IP (Vercel
 * appends its own and strips spoofed entries). Falls back to the last entry
 * for other reverse-proxy setups, then to "unknown".
 */
export function getClientIP(request: Request): string {
  // Vercel sets this header to the verified client IP
  const vercelIp = request.headers.get("x-real-ip");
  if (vercelIp) return vercelIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    return parts[0] || "unknown";
  }
  return "unknown";
}

/**
 * Return a 429 response with rate limit headers.
 */
export function rateLimitResponse(headers: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers }
  );
}
