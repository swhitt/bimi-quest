import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock rate limit to allow by default
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    headers: { "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "19" },
  })),
  getClientIP: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn((headers: Record<string, string>) =>
    NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

const mockLookupBIMIRecord = vi.fn();
vi.mock("@/lib/bimi/dns", () => ({
  lookupBIMIRecord: (...args: unknown[]) => mockLookupBIMIRecord(...args),
}));

// Mock DB for fingerprint lookups
const mockDbSelect = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  certificates: {
    fingerprintSha256: "fingerprint_sha256",
    rawPem: "raw_pem",
  },
}));

const mockSafeFetch = vi.fn();
vi.mock("@/lib/net/safe-fetch", () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

// Import route after all mocks are registered
import { POST } from "../route";

// ── Fixtures ────────────────────────────────────────────────────────

// A real VMC PEM for testing — this is the CNN VMC from the test fixtures
const VALID_PEM = `-----BEGIN CERTIFICATE-----
MIIMqDCCCpCgAwIBAgIQB2HqkrptA5tu4L9lfAsYITANBgkqhkiG9w0BAQsFADBf
MQswCQYDVQQGEwJVUzEXMBUGA1UEChMORGlnaUNlcnQsIEluYy4xNzA1BgNVBAMT
LkRpZ2lDZXJ0IFZlcmlmaWVkIE1hcmsgUlNBNDA5NiBTSEEyNTYgMjAyMSBDQTEw
HhcNMjUwODExMDAwMDAwWhcNMjYwOTAxMjM1OTU5WjCCAUMxEzARBgsrBgEEAYI3
PAIBAxMCVVMxGTAXBgsrBgEEAYI3PAIBAhMIRGVsYXdhcmUxHTAbBgNVBA8TFFBy
aXZhdGUgT3JnYW5pemF0aW9uMRAwDgYDVQQFEwcyOTc2NzMwMQswCQYDVQQGEwJV
UzEQMA4GA1UECBMHR2VvcmdpYTEQMA4GA1UEBxMHQXRsYW50YTEbMBkGA1UECRMS
MTkwIE1hcmlldHRhIFN0IE5XMSEwHwYDVQQKExhDYWJsZSBOZXdzIE5ldHdvcmss
IEluYy4xITAfBgNVBAMTGENhYmxlIE5ld3MgTmV0d29yaywgSW5jLjEfMB0GCisG
AQQBg55fAQ0TD1JlZ2lzdGVyZWQgTWFyazESMBAGCisGAQQBg55fAQMTAlVTMRcw
FQYKKwYBBAGDnl8BBBMHNTgxNzkzMDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBANN8YPE9Di54HUF1o80OjVBL4qVoGfTmksRPP8pd/SQEg4bkkQmpB39p
4SIYOO2B10Ejk6WthfJJeFyG+AGSb/L54wB+jz/tcO4khpa8OvfKrk4yws4QJyB5
IOpxyCNlWvA1mVNH95VKgabDRtWkpdmNkFn/78micLUan7qME3iok4in4h1cUqJu
yCmkAA6T3W7wfZpiM4fuY4q2nDRUl1pBZxoJZzPLRtN4d9M7x5y1NDl1GY1Jh2by
lLuHv+dfMd8LJmLoupEj7OVMSWfsCb0tJ93okGf30u1Q3rDBo4N/hMmC8CNPQtTd
C5xZocblp1KOz6Uq6Gm1r40Oz/O2bqECAwEAAaOCB3gwggd0MB8GA1UdIwQYMBaA
FL6fvY1XbZW1rWPDl06rqIRdOgf1MB0GA1UdDgQWBBQymAv5kLogLN1QZbGi+bKl
3FNprjASBgNVHREECzAJggdjbm4uY29tMFAGA1UdIARJMEcwNwYKYIZIAYb9bAAC
BTApMCcGCCsGAQUFBwIBFhtodHRwOi8vd3d3LmRpZ2ljZXJ0LmNvbS9DUFMwDAYK
KwYBBAGDnl8BATATBgNVHSUEDDAKBggrBgEFBQcDHzCBpQYDVR0fBIGdMIGaMEug
SaBHhkVodHRwOi8vY3JsMy5kaWdpY2VydC5jb20vRGlnaUNlcnRWZXJpZmllZE1h
cmtSU0E0MDk2U0hBMjU2MjAyMUNBMS5jcmwwS6BJoEeGRWh0dHA6Ly9jcmw0LmRp
Z2ljZXJ0LmNvbS9EaWdpQ2VydFZlcmlmaWVkTWFya1JTQTQwOTZTSEEyNTYyMDIx
Q0ExLmNybDBkBggrBgEFBQcBAQRYMFYwVAYIKwYBBQUHMAKGSGh0dHA6Ly9jYWNl
cnRzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydFZlcmlmaWVkTWFya1JTQTQwOTZTSEEy
NTYyMDIxQ0ExLmNydDAMBgNVHRMBAf8EAjAAMIIFDAYIKwYBBQUHAQwEggT+MIIE
+qKCBPagggTyMIIE7jCCBOowggTmFg1pbWFnZS9zdmcreG1sMCMwITAJBgUrDgMC
GgUABBTqjIHaYzxmoWJiE0p4V2zfBnY46TCCBK4WggSqZGF0YTppbWFnZS9zdmcr
eG1sO2Jhc2U2NCxINHNJQUFBQUFBQUFDcDFVVFcvYk9CQTl4NitDcTU0S2tEU0hG
TCtNT0VVYkZFMkJibEZnQVY4WHJxTEd3bXB0UTFia3RMOSszMUFKMGtOUVlBc2s1
SGlHbkhuejVsR1hieDc2N2NYVURxZnVzRjlYcEUwbDJuMXp1TzMyZCt2cWZ2eW1V
dlhtYW5INWgxTGlRN3R2aCsxNEdGYmk3ZTNoYXlzKzl2MzlhU3d1WVd1TnkxTDh0
ZmtnM2o4Y0Q0TW92dlQzZCtyalh1amkzTXcxVmlKb1k4UzcrNjYvRmVhMUVFb2gv
V202K3htRXJjVFg3YW45TWh5K2RYMjdyc1p1LzEwZFQ1WG9idGZWcCszM2R2aWJL
Z0hrKzlPNjJvM2pjYlZjbnM5bmZYYjZNTnd0clRGbWlaU1BSMVlQZmJmLzU2V0Rs
SE5lbG1pMW1McjIvTzd3c0s2TU1DS0hxUDI4bGlTcjAzSGJBTWh4YUUvdE1MVVZN
SS9kMkxkWDE1OC9YeTVuYzNGNTNJNDdBY2o5dW5wMWZRMFVZQk9JLzR3eGF5K2Rk
ZHBPTnBDdUd5UEo2Rm9GdUNsclVoUzBsWlowYWhUcExJMzJ5dW1FUFNtdkkrK05p
cnFXUnBHSHorbW9yRlVFMGorRldNczZCWjBYRjcxQ2NxZkllRDd2VUlBUEoyM3g3
eFZaM0lyYWNTUkxRbkZjMUtIc2ViS0dxLzhDVjlKT1dxU0NQeXVEbUkzSVIwNDdM
dXh4VUdXZ0FJYkFmdkl2SWtnemdscVNaZ1FCQ1BJakFzb2NBZ0owQUk0a0pGVXJY
b3AxWXhNS05adzlNUTNXNEtLdkdXTXhlUVgrT2Y3c2w4VS8yenVnM25rN0taZDEy
Q2x2MFZRQ0JCejFHU3hIcHBWOGdrbkJjbDhOeVJUQlFDUW14RWVPekhGZWR3VE9i
T1BRbWpReVlMb1lDbXhZNkEwUUpwVnhFUzBoV25NRzlHVWxxd29tQ0d0cWtpRXpB
a280RENDZFRTYVpGaGU0SHpYOTd2MU5FZHhORWQrUGF2a0xmVkwwR0c2ZDBIOERq
aVRZWUUyaEZwbkk2VTNwbkZmMGJGQTQ0RHdtQlRncXpCc3ZHNWNzNnhCallCbkp3
RE1IRXNsZ1ZaRVJWS1FzSjg1RjVpUnRTZTE0OHF4di9IQTFRMGlJbDFsQ1NlREFN
dXMxNC9MOElJS1FyRGpzT3FHZVl6L09NbVNlQmd0TnNwckFCSkpCWjZybWZHQW16
eUJmZ2toUEVPMFR4UFFFTWNoWjZNOGdqZlNFblYrem5CL2NzNnM0TE1lWU95VCtu
d0I1Ymp0V2FaeUkyK1c2MER4clFORk1laXdtYTBEVkVCdEVvT2JKMTBYdVJRL2Mx
L1Nrb04rN3pRK0RTdHNZQ1Y1WlVhSGhaMktnQUNyZkpZNFpyTGFzME1WT2hSSnd6
QnNLNDN0VlBpb0pmNmRIVTVaZk44NzVqWXZsTVM0dXJpMGFEeEsvZVI3UUpFU0lw
Ky9rVC9xY2hjeGY5NnZGZjJ5VHVidTlCZ0FBMIGKBgorBgEEAdZ5AgQCBHwEegB4
AHYAVVlTrjCWAIBs0utSCKbJnpMYKKwQVrRCHFU2FUxfdawAAAGYmhemCAAABAMA
RzBFAiB8NFeLbg4mwKl19DYUoqMSpjRDBecKlLws23/9zrbjkQIhAIjlCAC102Mu
M6qBpMyicFFLx2TXmBwi0+v872bbzPQ6MA0GCSqGSIb3DQEBCwUAA4ICAQBUId+t
u7R6H1EC9e13zh+9VDpz8VJ5u/0737SmTaU0qViZ4fJ0ChG2LJtGSJdcYyM6/a16
x8LAQOzOJTCl6UKim8YBLRRbFoGFZaNOix6S/CMhkCsm7hgDg252KN2PCcJMiyd0
xo1f2Lq9YrK10ZmNrdgPYCGRNaeMA0lmwBpoa2MyBNWcG3hNGCnQLcyX1SftudmK
inJobHTLNMnIJBI5qD6xaSNN0g1MFTcDCQI28hN1T4J9obKhhbxWCFFB/vezFmv3
BCTb45YtBRmLrUXjfhHyU7BOu4YoRYfkq82N10BL/RQkkCedW4GSvsm1uO9Y8b+T
a1jp1U9hdJfMP/nf1QZNEhn3w/ZmitFdC6BteX5eMULCuMLi3Z86wby91tDSy+8X
eKvpOGYB5gy3ygkvJk4hCgGEr8IPIeZ20Bp42EHsp6bg+IJDzJt9nxfY0754231x
atmHi+2aH9Ebk2yaD4+OIGxr7MToJWnLJ8sniOXSHkFz/V5otcgkZShhWOEkrYuI
86/C2y8drmeDnU0L82kcqnVEXdyMNE4tyqlbruFPIvdFa/TcQi8rrUlIJLydeR2z
OfA87JNuYPDd0F7Ms3urjS19P1cht/KVsx77JpIPvou6LCFYKip5HqdFL0w+AKwR
40rPe2Bdslw04OmQp3rWpFa2c1h9Nzfg9fj6Tw==
-----END CERTIFICATE-----`;

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/lint"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

function makeRequestWithRawBody(raw: string): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/lint"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: raw,
  });
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/lint", () => {
  // ── PEM input ────────────────────────────────────────────────────

  it("returns 200 with results, summary, and cert metadata for valid PEM", async () => {
    const req = makeRequest({ pem: VALID_PEM });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("cert");
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("returns cert metadata with expected shape", async () => {
    const req = makeRequest({ pem: VALID_PEM });
    const res = await POST(req);
    const body = await res.json();
    const { cert } = body;
    expect(cert).toHaveProperty("subject");
    expect(cert).toHaveProperty("issuer");
    expect(cert).toHaveProperty("serialNumber");
    expect(cert).toHaveProperty("notBefore");
    expect(cert).toHaveProperty("notAfter");
    expect(cert).toHaveProperty("certType");
    expect(cert).toHaveProperty("sanList");
    expect(Array.isArray(cert.sanList)).toBe(true);
  });

  it("returns summary with error/warning/notice/passed counts", async () => {
    const req = makeRequest({ pem: VALID_PEM });
    const res = await POST(req);
    const body = await res.json();
    const { summary } = body;
    expect(typeof summary.errors).toBe("number");
    expect(typeof summary.warnings).toBe("number");
    expect(typeof summary.notices).toBe("number");
    expect(typeof summary.passed).toBe("number");
  });

  // ── Invalid PEM ──────────────────────────────────────────────────

  it("returns 400 for invalid PEM content", async () => {
    const req = makeRequest({ pem: "not a valid certificate" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // ── Oversized PEM ────────────────────────────────────────────────

  it("returns 400 for PEM exceeding 100KB", async () => {
    const oversized = "-----BEGIN CERTIFICATE-----\n" + "A".repeat(100_001) + "\n-----END CERTIFICATE-----";
    const req = makeRequest({ pem: oversized });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Missing body fields ──────────────────────────────────────────

  it("returns 400 when body has no recognized input field", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // ── Invalid JSON ─────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    const req = makeRequestWithRawBody("not json{{{");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  // ── Rate limiting ────────────────────────────────────────────────

  it("returns 429 when rate limit exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetMs: 60000,
      headers: { "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "0" },
    });

    const req = makeRequest({ pem: VALID_PEM });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
