import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock the dns module before importing safeFetch
vi.mock("dns", () => ({
  promises: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
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
    // One public IP, one private
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
});
