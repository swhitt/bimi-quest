import { describe, expect, it } from "vitest";
import { detectSearchType, extractDomain, normalizeHex } from "./search-detect";

// Helper to build a hex string of exactly n chars
function hexOf(n: number): string {
  return "a".repeat(n);
}

describe("detectSearchType", () => {
  describe("empty / whitespace", () => {
    it('returns "text" for empty string', () => {
      expect(detectSearchType("")).toBe("text");
    });

    it('returns "text" for whitespace-only string', () => {
      expect(detectSearchType("   ")).toBe("text");
    });
  });

  describe("domain detection", () => {
    it('returns "domain" for a plain domain', () => {
      expect(detectSearchType("example.com")).toBe("domain");
    });

    it('returns "domain" for a subdomain', () => {
      expect(detectSearchType("mail.example.com")).toBe("domain");
    });

    it('returns "domain" for an email address', () => {
      expect(detectSearchType("user@example.com")).toBe("domain");
    });

    it('returns "domain" for a URL with protocol', () => {
      expect(detectSearchType("https://example.com/path")).toBe("domain");
    });

    // Critical: "abed.cafe" contains only hex chars and a dot but must be treated as domain
    it('returns "domain" for "abed.cafe" (not hex)', () => {
      expect(detectSearchType("abed.cafe")).toBe("domain");
    });

    it('returns "domain" for a TLD-only-hex domain like "dead.beef.com"', () => {
      expect(detectSearchType("dead.beef.com")).toBe("domain");
    });
  });

  describe("fingerprint detection (64-char hex)", () => {
    it('returns "fingerprint" for a 64-char lowercase hex string', () => {
      expect(detectSearchType(hexOf(64))).toBe("fingerprint");
    });

    it('returns "fingerprint" for a 64-char uppercase hex string', () => {
      expect(detectSearchType("A".repeat(64))).toBe("fingerprint");
    });

    it('returns "fingerprint" for 64 hex chars with colon separators', () => {
      // 32 pairs joined by colons → 32*2 + 31 = 95 chars total
      const pairs = Array.from({ length: 32 }, () => "ab").join(":");
      expect(detectSearchType(pairs)).toBe("fingerprint");
    });

    it('returns "fingerprint" for 64 hex chars with dash separators', () => {
      const pairs = Array.from({ length: 32 }, () => "cd").join("-");
      expect(detectSearchType(pairs)).toBe("fingerprint");
    });

    it('returns "fingerprint" for 64 hex chars with space separators', () => {
      const pairs = Array.from({ length: 32 }, () => "ef").join(" ");
      expect(detectSearchType(pairs)).toBe("fingerprint");
    });
  });

  describe("serial detection (hex, not 64 chars)", () => {
    it('returns "serial" for a 20-char hex string', () => {
      expect(detectSearchType(hexOf(20))).toBe("serial");
    });

    it('returns "serial" for a 16-char hex string', () => {
      expect(detectSearchType(hexOf(16))).toBe("serial");
    });

    it('returns "serial" for a 40-char hex string', () => {
      expect(detectSearchType(hexOf(40))).toBe("serial");
    });

    it('returns "serial" for an 8-char hex string', () => {
      expect(detectSearchType(hexOf(8))).toBe("serial");
    });

    it('returns "serial" for 20-char hex with colon separators', () => {
      const pairs = Array.from({ length: 10 }, () => "ab").join(":");
      expect(detectSearchType(pairs)).toBe("serial");
    });

    it('returns "serial" for 20-char hex with dash separators', () => {
      const pairs = Array.from({ length: 10 }, () => "cd").join("-");
      expect(detectSearchType(pairs)).toBe("serial");
    });
  });

  describe("text fallback", () => {
    it('returns "text" for a plain word', () => {
      expect(detectSearchType("hello")).toBe("text");
    });

    it('returns "text" for a string with spaces (not hex)', () => {
      expect(detectSearchType("hello world")).toBe("text");
    });

    it('returns "text" for a 7-char hex string (too short)', () => {
      expect(detectSearchType(hexOf(7))).toBe("text");
    });

    it('returns "text" for a non-hex string of sufficient length', () => {
      expect(detectSearchType("not-a-hex-value!")).toBe("text");
    });
  });
});

describe("normalizeHex", () => {
  it("lowercases a plain hex string", () => {
    expect(normalizeHex("AABBCC")).toBe("aabbcc");
  });

  it("strips colon separators and lowercases", () => {
    expect(normalizeHex("AA:BB:CC")).toBe("aabbcc");
  });

  it("strips dash separators and lowercases", () => {
    expect(normalizeHex("AA-BB-CC")).toBe("aabbcc");
  });

  it("strips space separators and lowercases", () => {
    expect(normalizeHex("AA BB CC")).toBe("aabbcc");
  });

  it("handles mixed separators", () => {
    expect(normalizeHex("AA:BB-CC DD")).toBe("aabbccdd");
  });

  it("leaves already-lowercase hex unchanged", () => {
    expect(normalizeHex("aabbcc")).toBe("aabbcc");
  });
});

describe("extractDomain", () => {
  it("extracts domain from an email address", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
  });

  it("strips https:// and path", () => {
    expect(extractDomain("https://example.com/path")).toBe("example.com");
  });

  it("strips http:// and lowercases", () => {
    expect(extractDomain("http://EXAMPLE.COM")).toBe("example.com");
  });

  it("trims leading/trailing whitespace", () => {
    expect(extractDomain("  example.com  ")).toBe("example.com");
  });

  it("lowercases the result", () => {
    expect(extractDomain("EXAMPLE.COM")).toBe("example.com");
  });

  it("handles a plain domain with no protocol or email", () => {
    expect(extractDomain("example.com")).toBe("example.com");
  });

  it("strips path from a URL without protocol after trim", () => {
    expect(extractDomain("example.com/some/path")).toBe("example.com");
  });

  it("uses the part after @ for email with subdomain", () => {
    expect(extractDomain("admin@mail.example.com")).toBe("mail.example.com");
  });
});
