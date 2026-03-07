import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock the dns module before importing safeFetch
vi.mock("dns", () => ({
  promises: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

// Mock undici Agent to capture the lookup callback
const mockAgentConstructor = vi.fn();
vi.mock("undici", () => ({
  Agent: class MockAgent {
    constructor(opts: unknown) {
      mockAgentConstructor(opts);
    }
  },
}));

import { promises as dns } from "dns";
import { safeFetch } from "./safe-fetch";

const mockResolve4 = dns.resolve4 as unknown as Mock;
const mockResolve6 = dns.resolve6 as unknown as Mock;

const mockFetch = vi.fn();
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockResolvedValue(new Response("ok"));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("safeFetch", () => {
  it("allows fetch to public IPs", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("preserves original hostname in URL for correct TLS SNI", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test");
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://example.com/test");
  });

  it("pins connection via undici Agent with custom DNS lookup", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test");
    expect(mockAgentConstructor).toHaveBeenCalledOnce();

    // Extract the lookup callback and verify it returns the validated IP
    // biome-ignore lint: test helper extracts the lookup fn
    const agentOpts = mockAgentConstructor.mock.calls[0][0] as {
      connect: { lookup: (...args: unknown[]) => void };
    };
    const callback = vi.fn();
    agentOpts.connect.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("uses redirect: error to prevent redirect-based SSRF", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test");
    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect(calledInit.redirect).toBe("error");
  });

  it("passes dispatcher to fetch", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test");
    const calledInit = mockFetch.mock.calls[0][1] as Record<string, unknown>;
    expect(calledInit.dispatcher).toBeDefined();
  });

  it("blocks fetch when DNS resolves to private IPv4", async () => {
    mockResolve4.mockResolvedValue(["127.0.0.1"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await expect(safeFetch("https://evil.example.com/test")).rejects.toThrow(/DNS rebinding blocked.*127\.0\.0\.1/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks fetch when DNS resolves to private IPv6", async () => {
    mockResolve4.mockRejectedValue(new Error("no A"));
    mockResolve6.mockResolvedValue(["::1"]);

    await expect(safeFetch("https://evil.example.com/test")).rejects.toThrow(/DNS rebinding blocked.*::1/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks when any IP in the set is private", async () => {
    mockResolve4.mockResolvedValue(["8.8.8.8", "10.0.0.1"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await expect(safeFetch("https://mixed.example.com")).rejects.toThrow(/DNS rebinding blocked.*10\.0\.0\.1/);
  });

  it("blocks private hostnames before DNS resolution", async () => {
    await expect(safeFetch("https://localhost/test")).rejects.toThrow(/private\/internal host/);
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it("throws on DNS resolution failure", async () => {
    mockResolve4.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolve6.mockRejectedValue(new Error("NXDOMAIN"));

    await expect(safeFetch("https://nonexistent.example.com")).rejects.toThrow(/DNS resolution failed/);
  });

  it("checks IP literals directly without DNS", async () => {
    await expect(safeFetch("https://127.0.0.1/test")).rejects.toThrow(/private\/internal host/);
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it("rejects unsupported protocols", async () => {
    await expect(safeFetch("ftp://example.com/file")).rejects.toThrow(/Unsupported protocol/);
  });

  it("blocks RFC 1918 addresses via DNS", async () => {
    mockResolve4.mockResolvedValue(["192.168.1.1"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await expect(safeFetch("https://rebind.example.com")).rejects.toThrow(/DNS rebinding blocked.*192\.168\.1\.1/);
  });

  it("blocks cloud metadata IPs via DNS", async () => {
    mockResolve4.mockResolvedValue(["169.254.169.254"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await expect(safeFetch("https://metadata-stealer.com")).rejects.toThrow(
      /DNS rebinding blocked.*169\.254\.169\.254/,
    );
  });

  it("preserves caller-provided headers", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("no AAAA"));

    await safeFetch("https://example.com/test", {
      headers: { "User-Agent": "test-agent", Accept: "text/html" },
    });
    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("test-agent");
    expect(headers.Accept).toBe("text/html");
  });
});
