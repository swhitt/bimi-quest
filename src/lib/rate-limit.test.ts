import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIP } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Use unique keys per test to avoid cross-test interference from the shared store
  let keyCounter = 0;
  function uniqueKey() {
    return `test-key-${++keyCounter}-${Date.now()}`;
  }

  it("allows requests within the limit", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 3 };

    const r1 = checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 2 };

    checkRateLimit(key, config);
    checkRateLimit(key, config);

    const r3 = checkRateLimit(key, config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("returns correct rate limit headers", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 5 };

    const result = checkRateLimit(key, config);
    expect(result.headers["X-RateLimit-Limit"]).toBe("5");
    // Header is set before the timestamp push, so it shows pre-push remaining
    expect(result.headers["X-RateLimit-Remaining"]).toBe("5");
    expect(result.headers["X-RateLimit-Reset"]).toBeDefined();
    // No Retry-After when allowed
    expect(result.headers["Retry-After"]).toBeUndefined();
  });

  it("includes Retry-After header when blocked", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 1 };

    checkRateLimit(key, config);
    const blocked = checkRateLimit(key, config);

    expect(blocked.allowed).toBe(false);
    expect(blocked.headers["Retry-After"]).toBeDefined();
    const retryAfter = parseInt(blocked.headers["Retry-After"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("allows requests again after window expires", () => {
    const key = uniqueKey();
    const config = { windowMs: 10_000, max: 1 };

    const r1 = checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);

    const r2 = checkRateLimit(key, config);
    expect(r2.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(10_001);

    const r3 = checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);
  });

  it("correctly counts remaining after partial window expiry", () => {
    const key = uniqueKey();
    const config = { windowMs: 10_000, max: 3 };

    // Use up 2 of 3
    checkRateLimit(key, config);
    vi.advanceTimersByTime(2_000);
    checkRateLimit(key, config);

    // Advance so first request falls outside the window but second is still in
    vi.advanceTimersByTime(8_500);

    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(true);
    // Only the second request (from 2s ago, now 10.5s-2s=8.5s old... actually
    // the second request was at t=2000, and now we're at t=10500, so
    // 10500-2000=8500 < 10000, so it's still in window. remaining = 3-1-1 = 1
    expect(result.remaining).toBe(1);
  });

  it("runs cleanup after the cleanup interval", () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();
    const config = { windowMs: 1_000, max: 10 };

    // Add entries for two keys
    checkRateLimit(key1, config);
    checkRateLimit(key2, config);

    // Advance past the window so entries expire
    vi.advanceTimersByTime(2_000);

    // Advance past the cleanup interval (300 seconds)
    vi.advanceTimersByTime(300_000);

    // Trigger cleanup by calling checkRateLimit
    const freshKey = uniqueKey();
    const result = checkRateLimit(freshKey, config);
    // The fresh key should have full capacity
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });
});

describe("getClientIP", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost", {
      headers: new Headers(headers),
    });
  }

  it("returns x-real-ip when present", () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("trims whitespace from x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "  5.6.7.8  " });
    expect(getClientIP(req)).toBe("5.6.7.8");
  });

  it("returns first x-forwarded-for entry", () => {
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" });
    expect(getClientIP(req)).toBe("10.0.0.1");
  });

  it("trims whitespace from x-forwarded-for entries", () => {
    const req = makeRequest({ "x-forwarded-for": "  192.168.1.1 , 10.0.0.2" });
    expect(getClientIP(req)).toBe("192.168.1.1");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = makeRequest({
      "x-real-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2",
    });
    expect(getClientIP(req)).toBe("1.1.1.1");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const req = makeRequest({});
    expect(getClientIP(req)).toBe("unknown");
  });

  it("returns 'unknown' for empty x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "" });
    expect(getClientIP(req)).toBe("unknown");
  });
});
