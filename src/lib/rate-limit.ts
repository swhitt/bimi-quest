import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * Distributed rate limiter using @vercel/firewall on Vercel, with an
 * in-memory per-instance fallback for local development.
 *
 * On Vercel, rate limit rules are configured in the Firewall dashboard.
 * Each rule ID maps to a key prefix (e.g. "gallery", "validate").
 * The dashboard controls the actual window/max; the config passed here
 * is used only for the in-memory fallback and for response headers.
 */

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / non-Vercel deployments)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

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

function checkInMemoryRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  cleanup(config.windowMs);

  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  const remaining = Math.max(0, config.max - entry.timestamps.length);
  const resetMs = entry.timestamps.length > 0 ? entry.timestamps[0] + config.windowMs : now + config.windowMs;

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.max),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
  };

  if (entry.timestamps.length >= config.max) {
    headers["Retry-After"] = String(Math.ceil((resetMs - now) / 1000));
    store.set(key, entry);
    log("warn", "rate_limit.exceeded", { key, max: config.max, windowMs: config.windowMs });
    return { allowed: false, remaining: 0, resetMs, headers };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return { allowed: true, remaining: remaining - 1, resetMs, headers };
}

// ---------------------------------------------------------------------------
// @vercel/firewall distributed rate limiting
// ---------------------------------------------------------------------------

/**
 * Try the Vercel WAF rate limiter. Returns null if unavailable (local dev,
 * package not configured, or firewall rule missing).
 */
async function checkFirewallRateLimit(ruleId: string, request: Request): Promise<boolean | null> {
  try {
    const { checkRateLimit: vercelCheck } = await import("@vercel/firewall");
    const { rateLimited } = await vercelCheck(ruleId, { request });
    return rateLimited;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

/**
 * Check rate limit for a request. Uses @vercel/firewall when deployed on
 * Vercel (distributed, edge-enforced). Falls back to in-memory otherwise.
 *
 * @param key   - Rate limit key, e.g. "gallery:1.2.3.4". The prefix before
 *                ":" is used as the firewall rule ID on Vercel.
 * @param config - Window/max for in-memory fallback and response headers.
 * @param request - The incoming request. Required for @vercel/firewall;
 *                  omit only in tests.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  request?: Request,
): Promise<RateLimitResult> {
  // On Vercel, try the distributed firewall check first
  if (process.env.VERCEL && request) {
    const ruleId = key.split(":")[0];
    const rateLimited = await checkFirewallRateLimit(ruleId, request);

    if (rateLimited !== null) {
      const now = Date.now();
      const resetMs = now + config.windowMs;
      if (rateLimited) {
        const headers: Record<string, string> = {
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
          "Retry-After": String(Math.ceil(config.windowMs / 1000)),
        };
        log("warn", "rate_limit.exceeded", { key, max: config.max, windowMs: config.windowMs, distributed: true });
        return { allowed: false, remaining: 0, resetMs, headers };
      }
      // Firewall says allowed — we don't know exact remaining count
      return {
        allowed: true,
        remaining: config.max,
        resetMs,
        headers: {
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": String(config.max),
          "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
        },
      };
    }
  }

  // Fallback: in-memory rate limiting
  return checkInMemoryRateLimit(key, config);
}

/**
 * Extract client IP from the request.
 * On Vercel, the leftmost X-Forwarded-For entry is the client IP (Vercel
 * appends its own and strips spoofed entries). Falls back to the last entry
 * for other reverse-proxy setups, then to "unknown".
 */
export function getClientIP(request: Request): string {
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
  return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers });
}
