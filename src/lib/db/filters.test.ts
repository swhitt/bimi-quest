import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock the database module: return a chainable query builder that resolves
// to whatever mockDbResult is set to for each test.
let mockDbResult: unknown[] = [];

const chainable = () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal: the chain is also thenable (awaitable), resolving to mockDbResult
  chain.then = (resolve: (v: unknown) => void) => resolve(mockDbResult);
  return chain;
};

vi.mock("@/lib/db", () => {
  const dbProxy = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (prop === "select") return () => chainable();
      return undefined;
    },
  });
  return { db: dbProxy };
});

vi.mock("@/lib/db/schema", () => ({
  certificates: {
    id: "id",
    fingerprintSha256: "fingerprint_sha256",
    certType: "cert_type",
    markType: "mark_type",
    isPrecert: "is_precert",
    isSuperseded: "is_superseded",
    subjectCountry: "subject_country",
    industry: "industry",
    notBefore: "not_before",
    notAfter: "not_after",
    issuerOrg: "issuer_org",
    rootCaOrg: "root_ca_org",
  },
}));

// Import after mocks are registered
import { resolveCertParam } from "./filters";

// ── Helpers ─────────────────────────────────────────────────────────

const FINGERPRINT_64 = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult = [];
});

// ── Tests ────────────────────────────────────────────────────────────

describe("resolveCertParam", () => {
  describe("numeric ID lookup", () => {
    it("resolves a numeric ID when the DB returns a matching row", async () => {
      mockDbResult = [{ id: 42, fingerprint: "abc123" }];

      const result = await resolveCertParam("42");

      expect(result).toEqual({ id: 42, fingerprint: "abc123", error: null });
    });

    it("returns null id and fingerprint when numeric ID has no DB match", async () => {
      mockDbResult = [];

      const result = await resolveCertParam("99999");

      expect(result).toEqual({ id: null, fingerprint: null, error: null });
    });
  });

  describe("hex prefix lookup", () => {
    it("accepts an 8-character hex prefix (minimum boundary) and returns a single match", async () => {
      mockDbResult = [{ id: 7, fingerprint: "abcdef01" + "x".repeat(56) }];

      const result = await resolveCertParam("abcdef01");

      expect(result).toEqual({
        id: 7,
        fingerprint: "abcdef01" + "x".repeat(56),
        error: null,
      });
    });

    it("rejects a 7-character hex string as invalid (below minimum prefix length)", async () => {
      const result = await resolveCertParam("abcdef0");

      expect(result).toEqual({
        id: null,
        fingerprint: null,
        error: { message: "Invalid certificate ID or hash", status: 400 },
      });
    });

    it("returns ambiguous error when a hex prefix matches 2 rows", async () => {
      mockDbResult = [
        { id: 10, fingerprint: "abcdef0123" + "a".repeat(54) },
        { id: 11, fingerprint: "abcdef0123" + "b".repeat(54) },
      ];

      const result = await resolveCertParam("abcdef0123");

      expect(result).toEqual({
        id: null,
        fingerprint: null,
        error: { message: "Ambiguous hash prefix, please provide more characters", status: 400 },
      });
    });

    it("returns null when a non-64-char hex prefix has no DB matches", async () => {
      mockDbResult = [];

      const result = await resolveCertParam("abcdef0123");

      expect(result).toEqual({ id: null, fingerprint: null, error: null });
    });
  });

  describe("64-character fingerprint lookup", () => {
    it("resolves an exact 64-char fingerprint when the DB returns a match", async () => {
      mockDbResult = [{ id: 5, fingerprint: FINGERPRINT_64 }];

      const result = await resolveCertParam(FINGERPRINT_64);

      expect(result).toEqual({ id: 5, fingerprint: FINGERPRINT_64, error: null });
    });

    it("returns null when an exact 64-char fingerprint has no DB match", async () => {
      mockDbResult = [];

      const result = await resolveCertParam(FINGERPRINT_64);

      expect(result).toEqual({ id: null, fingerprint: null, error: null });
    });
  });

  describe("invalid input", () => {
    it("returns an invalid error for non-hex, non-numeric input", async () => {
      const result = await resolveCertParam("not-a-valid-id");

      expect(result).toEqual({
        id: null,
        fingerprint: null,
        error: { message: "Invalid certificate ID or hash", status: 400 },
      });
    });

    it("returns an invalid error for mixed alphanumeric input that is not pure hex", async () => {
      // 'g' is not a valid hex character
      const result = await resolveCertParam("abcdefg1");

      expect(result).toEqual({
        id: null,
        fingerprint: null,
        error: { message: "Invalid certificate ID or hash", status: 400 },
      });
    });
  });
});
