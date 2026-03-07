import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock rate limit to allow by default
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    headers: { "X-RateLimit-Limit": "10", "X-RateLimit-Remaining": "9" },
  })),
  getClientIP: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn((headers: Record<string, string>) =>
    NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers }),
  ),
}));

const mockValidateDomain = vi.fn();
vi.mock("@/lib/bimi/validate", () => ({
  validateDomain: (...args: unknown[]) => mockValidateDomain(...args),
}));

vi.mock("@/lib/bimi/ingest-from-pem", () => ({
  ingestFromPem: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

import { ingestFromPem } from "@/lib/bimi/ingest-from-pem";
import { checkRateLimit } from "@/lib/rate-limit";
// Import route after all mocks are registered
import { POST } from "./route";

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

/** A minimal successful validateDomain result with no certificate found. */
function makeValidateResult(overrides: Record<string, unknown> = {}) {
  return {
    domain: "example.com",
    selector: "default",
    bimi: { found: false },
    dmarc: { found: false },
    certificate: { found: false },
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateDomain.mockResolvedValue(makeValidateResult());
});

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/validate", () => {
  // ── Input validation ────────────────────────────────────────────

  it("returns 400 when domain is missing from body", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request body");
  });

  it("returns 400 when domain is an empty string", async () => {
    const req = makeRequest({ domain: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain is required");
  });

  it("returns 400 when domain is a whitespace-only string", async () => {
    const req = makeRequest({ domain: "   " });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain is required");
  });

  it("returns 400 when domain exceeds 253 characters", async () => {
    // 254 characters: 63-char label repeated to exceed the limit
    const longDomain = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}`;
    expect(longDomain.length).toBeGreaterThan(253);
    const req = makeRequest({ domain: longDomain });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid domain format");
  });

  it("returns 400 when a label starts with a hyphen", async () => {
    const req = makeRequest({ domain: "-bad.example.com" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid domain format");
  });

  it("returns 400 when a label ends with a hyphen", async () => {
    const req = makeRequest({ domain: "bad-.example.com" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid domain format");
  });

  it("returns 400 when a label exceeds 63 characters", async () => {
    const longLabel = "a".repeat(64);
    const req = makeRequest({ domain: `${longLabel}.example.com` });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid domain format");
  });

  it("returns 400 when domain has only one label (no TLD)", async () => {
    const req = makeRequest({ domain: "localhost" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid domain format");
  });

  // ── Email extraction ────────────────────────────────────────────

  it("extracts the domain from an email address", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult({ domain: "example.com" }));

    const req = makeRequest({ domain: "user@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // validateDomain should have been called with the extracted domain
    expect(mockValidateDomain).toHaveBeenCalledWith(expect.objectContaining({ domain: "example.com" }));
  });

  it("handles uppercase in email by lowercasing domain", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult({ domain: "example.com" }));

    const req = makeRequest({ domain: "User@EXAMPLE.COM" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockValidateDomain).toHaveBeenCalledWith(expect.objectContaining({ domain: "example.com" }));
  });

  // ── Successful validation ───────────────────────────────────────

  it("returns 200 with validation result for a valid domain", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult({ domain: "example.com" }));

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("bimi");
    expect(body).toHaveProperty("dmarc");
    expect(body).toHaveProperty("certificate");
  });

  it("does not include rawPem in the response", async () => {
    mockValidateDomain.mockResolvedValue(
      makeValidateResult({
        certificate: {
          found: true,
          rawPem: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
          subject: "CN=example.com",
        },
      }),
    );

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificate).not.toHaveProperty("rawPem");
    expect(body.certificate.found).toBe(true);
    expect(body.certificate.subject).toBe("CN=example.com");
  });

  it("calls ingestFromPem when certificate is found and rawPem is present", async () => {
    const rawPem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";
    mockValidateDomain.mockResolvedValue(
      makeValidateResult({
        certificate: { found: true, rawPem },
      }),
    );

    const req = makeRequest({ domain: "example.com" });
    await POST(req);
    // ingestFromPem is called async via .catch(); wait for microtasks to flush
    await Promise.resolve();
    expect(ingestFromPem).toHaveBeenCalledWith(rawPem, "validation");
  });

  it("does not call ingestFromPem when certificate is not found", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult({ certificate: { found: false } }));

    const req = makeRequest({ domain: "example.com" });
    await POST(req);
    await Promise.resolve();
    expect(ingestFromPem).not.toHaveBeenCalled();
  });

  it("does not call ingestFromPem when rawPem is absent even though found is true", async () => {
    mockValidateDomain.mockResolvedValue(
      makeValidateResult({ certificate: { found: true } }), // no rawPem property
    );

    const req = makeRequest({ domain: "example.com" });
    await POST(req);
    await Promise.resolve();
    expect(ingestFromPem).not.toHaveBeenCalled();
  });

  it("uses the provided selector when given", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult());

    const req = makeRequest({ domain: "example.com", selector: "custom" });
    await POST(req);
    expect(mockValidateDomain).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "example.com", selector: "custom" }),
    );
  });

  it("defaults the selector to 'default' when not provided", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult());

    const req = makeRequest({ domain: "example.com" });
    await POST(req);
    expect(mockValidateDomain).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "example.com", selector: "default" }),
    );
  });

  it("includes rate limit headers in a successful response", async () => {
    mockValidateDomain.mockResolvedValue(makeValidateResult());

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.has("X-RateLimit-Limit")).toBe(true);
    expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
  });

  // ── Rate limiting ───────────────────────────────────────────────

  it("returns 429 when the rate limit is exceeded", async () => {
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetMs: 60000,
      headers: { "X-RateLimit-Limit": "10", "X-RateLimit-Remaining": "0" },
    });

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limit exceeded");
  });

  // ── Error handling ──────────────────────────────────────────────

  it("returns 500 when validateDomain throws", async () => {
    mockValidateDomain.mockRejectedValue(new Error("DNS timeout"));

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("includes rate limit headers in a 500 response", async () => {
    mockValidateDomain.mockRejectedValue(new Error("DNS timeout"));

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(res.headers.has("X-RateLimit-Limit")).toBe(true);
    expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
  });
});
