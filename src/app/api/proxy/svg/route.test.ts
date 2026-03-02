import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock safeFetch before importing the route
vi.mock("@/lib/net/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

import { safeFetch } from "@/lib/net/safe-fetch";
import { GET, OPTIONS } from "./route";

const mockSafeFetch = safeFetch as unknown as ReturnType<typeof vi.fn>;

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    headers: { "x-real-ip": "1.2.3.4", ...headers },
  });
}

/** Build a ReadableStream from a string, used to simulate chunked responses. */
function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://bimi.quest";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("OPTIONS /api/proxy/svg", () => {
  it("returns 204 with CORS headers when Origin is set", async () => {
    const req = makeRequest("/api/proxy/svg", { Origin: "https://bimi.quest" });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://bimi.quest");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
  });
});

describe("GET /api/proxy/svg", () => {
  it("returns 400 when url parameter is missing", async () => {
    const req = makeRequest("/api/proxy/svg");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("url parameter required");
  });

  it("returns 400 for non-HTTPS URLs", async () => {
    const req = makeRequest("/api/proxy/svg?url=http://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Only HTTPS URLs are allowed");
  });

  it("returns 400 for completely invalid URLs", async () => {
    const req = makeRequest("/api/proxy/svg?url=not-a-url");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid URL");
  });

  it("returns 502 when upstream returns a non-OK status", async () => {
    mockSafeFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Upstream returned 404");
  });

  it("returns 502 when content-length exceeds 1MB limit", async () => {
    mockSafeFetch.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: {
          "content-length": String(2_000_000),
          "content-type": "image/svg+xml",
        },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("too large");
    expect(body.error).toContain("2000000");
  });

  it("returns 502 when content-type is not SVG/XML/image", async () => {
    mockSafeFetch.mockResolvedValue(
      new Response("not an svg", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Response is not an SVG");
  });

  it("returns 502 when response body does not contain <svg tag", async () => {
    const svgLikeBody = "<html><body>Hello</body></html>";
    mockSafeFetch.mockResolvedValue(
      new Response(streamFromString(svgLikeBody), {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Response does not appear to be SVG");
  });

  it("returns SVG content with correct headers for valid response", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>';
    mockSafeFetch.mockResolvedValue(
      new Response(streamFromString(svgContent), {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg", {
      Origin: "https://bimi.quest",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toBe(svgContent);

    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://bimi.quest");
  });

  it("accepts responses with content-type containing xml", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>';
    mockSafeFetch.mockResolvedValue(
      new Response(streamFromString(svgContent), {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("accepts responses with content-type containing image", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>';
    mockSafeFetch.mockResolvedValue(
      new Response(streamFromString(svgContent), {
        status: 200,
        headers: { "content-type": "image/svg+xml; charset=utf-8" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 502 when fetch throws an error", async () => {
    mockSafeFetch.mockRejectedValue(new Error("Connection refused"));

    // Use a unique URL to avoid hitting the in-memory cache from earlier tests
    const req = makeRequest("/api/proxy/svg?url=https://fetch-error.example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch SVG");
  });

  it("returns 502 when response body stream exceeds size limit", async () => {
    // Create a stream that delivers more than 1MB in chunks
    const chunkSize = 600_000;
    const chunk = "x".repeat(chunkSize);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        // Two chunks totaling 1.2MB, exceeding the 1MB limit
        controller.enqueue(encoder.encode(chunk));
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    mockSafeFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/huge.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("too large");
  });

  it("returns 502 when response has no body", async () => {
    // Create a mock response where body?.getReader() returns undefined
    const response = new Response(null, {
      status: 200,
      headers: { "content-type": "image/svg+xml" },
    });
    Object.defineProperty(response, "body", {
      value: null,
      writable: false,
      configurable: true,
    });

    mockSafeFetch.mockResolvedValue(response);

    // Use a unique URL to avoid hitting the in-memory cache
    const req = makeRequest("/api/proxy/svg?url=https://no-body.example.com/logo.svg");
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("No response body");
  });

  it("includes rate limit headers in successful responses", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    mockSafeFetch.mockResolvedValue(
      new Response(streamFromString(svgContent), {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );

    const req = makeRequest("/api/proxy/svg?url=https://example.com/rl.svg");
    const res = await GET(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
    expect(res.headers.has("X-RateLimit-Reset")).toBe(true);
  });
});
