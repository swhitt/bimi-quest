import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock the database module: return a chainable query builder that resolves
// to whatever mockDbResult is set to for each test.
let mockDbResult: unknown[] = [];
let mockDbExecuteResult: { rows: unknown[] } = { rows: [] };

const chainable = () => {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "limit", "orderBy", "innerJoin"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal: the chain is also thenable (awaitable), resolving to mockDbResult
  chain.then = (resolve: (v: unknown) => void) => resolve(mockDbResult);
  chain.execute = vi.fn(() => Promise.resolve(mockDbExecuteResult));
  return chain;
};

vi.mock("@/lib/db", () => {
  const dbProxy = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (prop === "select") return () => chainable();
      if (prop === "execute") return () => Promise.resolve(mockDbExecuteResult);
      return undefined;
    },
  });
  return { db: dbProxy };
});

vi.mock("@/lib/db/schema", () => ({
  certificates: {
    id: "id",
    serialNumber: "serial_number",
    isPrecert: "is_precert",
    issuerDn: "issuer_dn",
    fingerprintSha256: "fingerprint_sha256",
    ctLogIndex: "ct_log_index",
    ctLogTimestamp: "ct_log_timestamp",
    extensionsJson: "extensions_json",
    rawPem: "raw_pem",
    sanList: "san_list",
    subjectCn: "subject_cn",
    isSuperseded: "is_superseded",
  },
  chainCerts: {
    id: "id",
    fingerprintSha256: "fingerprint_sha256",
    subjectDn: "subject_dn",
    issuerDn: "issuer_dn",
    rawPem: "raw_pem",
    notBefore: "not_before",
    notAfter: "not_after",
  },
  certificateChainLinks: { leafCertId: "leaf_cert_id", chainCertId: "chain_cert_id", chainPosition: "chain_position" },
  domainBimiState: { domain: "domain" },
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

vi.mock("@/lib/net/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/net/hostname", () => ({
  isPrivateHostname: vi.fn(() => false),
}));

vi.mock("@/lib/x509/revocation", () => ({
  extractOcspUrl: vi.fn(() => null),
  extractCrlUrl: vi.fn(() => null),
  buildOcspRequest: vi.fn(),
  parseOcspResponse: vi.fn(),
  extractIssuerInfo: vi.fn(),
  pemToDer: vi.fn(),
  parseCrl: vi.fn(),
}));

vi.mock("@/lib/ct/parser", () => ({
  extractDnField: vi.fn(() => null),
  pemToDer: vi.fn(() => new Uint8Array()),
}));

vi.mock("@peculiar/x509", () => ({
  X509Certificate: vi.fn(() => ({
    serialNumber: "AABBCCDD",
    subject: "CN=Example",
    issuer: "CN=DigiCert",
  })),
}));

// Mock resolveCertParam separately so each test can control the resolution.
// resolveOrError (in @/lib/api-utils) delegates to resolveCertParam, so mocking
// the latter controls both.
const mockResolveCertParam = vi.fn();
vi.mock("@/lib/db/filters", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveCertParam: (...args: unknown[]) => mockResolveCertParam(...args),
  };
});

// Import routes after all mocks are registered
import { GET as getRevocation } from "./[id]/revocation/route";
import { GET as getCertDetail } from "./[id]/route";

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: { "x-real-ip": "1.2.3.4" },
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult = [];
  mockDbExecuteResult = { rows: [] };
});

// ── Certificate detail route tests ──────────────────────────────────

describe("GET /api/certificates/[id]", () => {
  it("returns 400 for invalid certificate ID format", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: null,
      fingerprint: null,
      error: { message: "Invalid certificate ID or hash", status: 400 },
    });

    const req = makeRequest("/api/certificates/xyz");
    const res = await getCertDetail(req, makeParams("xyz"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid certificate ID or hash");
  });

  it("returns 404 when resolveCertParam finds no match", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: null,
      fingerprint: null,
      error: null,
    });

    const req = makeRequest("/api/certificates/99999");
    const res = await getCertDetail(req, makeParams("99999"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Certificate not found");
  });

  it("returns 404 when cert ID resolves but DB row is missing", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: 42,
      fingerprint: "abcd1234",
      error: null,
    });
    // The first DB select returns empty (no cert found)
    mockDbResult = [];

    const req = makeRequest("/api/certificates/42");
    const res = await getCertDetail(req, makeParams("42"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Certificate not found");
  });

  it("returns 400 for ambiguous hash prefix", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: null,
      fingerprint: null,
      error: { message: "Ambiguous hash prefix, please provide more characters", status: 400 },
    });

    const req = makeRequest("/api/certificates/abcdef01");
    const res = await getCertDetail(req, makeParams("abcdef01"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Ambiguous");
  });

  it("returns certificate data with expected response shape", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: 1,
      fingerprint: "aabb",
      error: null,
    });

    const fakeCert = {
      id: 1,
      serialNumber: "01AB",
      isPrecert: false,
      issuerDn: "CN=DigiCert",
      fingerprintSha256: "aabbccdd",
      subjectCn: "example.com",
      sanList: ["example.com"],
      rawPem: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
      extensionsJson: {},
    };

    // The route performs multiple sequential queries; each query resolves
    // the awaited chain to mockDbResult. We make the first query (the cert
    // lookup) return our fake cert. Subsequent queries (paired cert, chain,
    // bimi states) will also resolve to this same value, but the route only
    // destructures [0] from the first query. For a unit test focused on
    // response shape, this is sufficient.
    mockDbResult = [fakeCert];

    const req = makeRequest("/api/certificates/1");
    const res = await getCertDetail(req, makeParams("1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("certificate");
    expect(body).toHaveProperty("pairedCert");
    expect(body).toHaveProperty("chain");
    expect(body).toHaveProperty("bimiStates");
    expect(body).toHaveProperty("sanCertCounts");
    expect(body.certificate.id).toBe(1);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=120");
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockResolveCertParam.mockRejectedValue(new Error("DB connection lost"));

    const req = makeRequest("/api/certificates/1");
    const res = await getCertDetail(req, makeParams("1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch certificate");
  });
});

// ── Revocation route tests ──────────────────────────────────────────

describe("GET /api/certificates/[id]/revocation", () => {
  it("returns 400 for invalid certificate param", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: null,
      fingerprint: null,
      error: { message: "Invalid certificate ID or hash", status: 400 },
    });

    const req = makeRequest("/api/certificates/bad/revocation");
    const res = await getRevocation(req, makeParams("bad"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid certificate ID or hash");
  });

  it("returns 404 when resolveCertParam finds no match", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: null,
      fingerprint: null,
      error: null,
    });

    const req = makeRequest("/api/certificates/99999/revocation");
    const res = await getRevocation(req, makeParams("99999"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Certificate not found");
  });

  it("returns 404 when cert ID resolves but DB row is missing", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: 42,
      fingerprint: "abcd",
      error: null,
    });
    mockDbResult = [];

    const req = makeRequest("/api/certificates/42/revocation");
    const res = await getRevocation(req, makeParams("42"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Certificate not found");
  });

  it("returns ocsp and crl as null when cert has no OCSP/CRL URLs", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: 1,
      fingerprint: "aabb",
      error: null,
    });

    const fakeCert = {
      id: 1,
      serialNumber: "01AB",
      rawPem: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
      extensionsJson: {},
    };

    mockDbResult = [fakeCert];

    const req = makeRequest("/api/certificates/1/revocation");
    const res = await getRevocation(req, makeParams("1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("ocsp");
    expect(body).toHaveProperty("crl");
    // With no OCSP/CRL URLs extracted, both should be null
    expect(body.ocsp).toBeNull();
    expect(body.crl).toBeNull();

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockResolveCertParam.mockRejectedValue(new Error("DB connection lost"));

    const req = makeRequest("/api/certificates/1/revocation");
    const res = await getRevocation(req, makeParams("1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to check revocation status");
  });

  it("includes rate limit headers in response", async () => {
    mockResolveCertParam.mockResolvedValue({
      id: 1,
      fingerprint: "aabb",
      error: null,
    });

    const fakeCert = {
      id: 1,
      serialNumber: "01AB",
      rawPem: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
      extensionsJson: {},
    };
    mockDbResult = [fakeCert];

    const req = makeRequest("/api/certificates/1/revocation");
    const res = await getRevocation(req, makeParams("1"));
    expect(res.headers.has("X-RateLimit-Limit")).toBe(true);
    expect(res.headers.has("X-RateLimit-Remaining")).toBe(true);
  });
});
