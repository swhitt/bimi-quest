import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock the database module: return a chainable query builder that resolves
// to whatever mockDbResult is set to for each test.
let mockDbResult: unknown[] = [];

const chainable = (result?: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "update", "set"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal: the chain is also thenable (awaitable), resolving to the provided result
  chain.then = (resolve: (v: unknown) => void) => resolve(result ?? mockDbResult);
  return chain;
};

vi.mock("@/lib/db", () => {
  const dbProxy = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (prop === "select") return () => chainable();
      if (prop === "update") return () => chainable(undefined);
      return undefined;
    },
  });
  return { db: dbProxy };
});

vi.mock("@/lib/db/schema", () => ({
  ingestionCursors: {
    logName: "log_name",
    lastIndex: "last_index",
    treeSize: "tree_size",
  },
}));

const mockGetSTH = vi.fn();
vi.mock("@/lib/ct/gorgon", () => ({
  getSTH: (...args: unknown[]) => mockGetSTH(...args),
}));

const mockProcessIngestBatch = vi.fn();
vi.mock("@/lib/ct/ingest-batch", () => ({
  processIngestBatch: (...args: unknown[]) => mockProcessIngestBatch(...args),
}));

vi.mock("@/lib/api-utils", () => ({
  apiError: vi.fn((_error: unknown, _key: string, _route: string, message: string) =>
    NextResponse.json({ error: message }, { status: 500 }),
  ),
  verifyCronAuth: (request: { headers: { get: (k: string) => string | null } }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  },
  resolveOrError: vi.fn(),
}));

// Import route after all mocks are registered
import { GET } from "./route";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/cron/ingest"), {
    headers,
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  mockDbResult = [];
  process.env.CRON_SECRET = "test-secret";
});

// ── Tests ────────────────────────────────────────────────────────────

describe("GET /api/cron/ingest", () => {
  describe("authentication", () => {
    it("returns 500 when CRON_SECRET is not set (fail-closed)", async () => {
      delete process.env.CRON_SECRET;

      const req = makeRequest({ authorization: "Bearer anything" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("CRON_SECRET is not configured");
    });

    it("returns 500 when CRON_SECRET is an empty string (fail-closed)", async () => {
      process.env.CRON_SECRET = "";

      const req = makeRequest({ authorization: "Bearer anything" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("CRON_SECRET is not configured");
    });

    it("returns 401 when no Authorization header is provided", async () => {
      const req = makeRequest();
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when Bearer token does not match CRON_SECRET", async () => {
      const req = makeRequest({ authorization: "Bearer wrong-secret" });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when authorization header has wrong scheme", async () => {
      const req = makeRequest({ authorization: "Basic test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("up-to-date response", () => {
    it("returns up-to-date status when cursor is at tree size", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 1000 });
      // Cursor matches tree size exactly
      mockDbResult = [{ lastIndex: 1000 }];

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("up-to-date");
      expect(body.treeSize).toBe(1000);
      expect(body.cursor).toBe(1000);
      expect(mockProcessIngestBatch).not.toHaveBeenCalled();
    });

    it("returns up-to-date status when cursor is ahead of tree size", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 500 });
      mockDbResult = [{ lastIndex: 600 }];

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("up-to-date");
      expect(body.treeSize).toBe(500);
      expect(body.cursor).toBe(600);
      expect(mockProcessIngestBatch).not.toHaveBeenCalled();
    });

    it("uses startIndex of 0 when no cursor row exists in DB", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 0 });
      // Empty DB result means no cursor row
      mockDbResult = [];

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("up-to-date");
      expect(body.cursor).toBe(0);
    });
  });

  describe("synced response shape", () => {
    it("returns synced status with correct shape when behind", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 2000 });
      mockDbResult = [{ lastIndex: 1800 }];
      mockProcessIngestBatch.mockResolvedValue({
        lastIndex: 2000,
        certsFound: 3,
        batchesRun: 2,
      });

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("synced");
      expect(body.treeSize).toBe(2000);
      expect(body.previousCursor).toBe(1800);
      expect(body.newCursor).toBe(2000);
      expect(body.behind).toBe(200);
      expect(body.entriesProcessed).toBe(200);
      expect(body.certsFound).toBe(3);
      expect(body.batchesRun).toBe(2);
    });

    it("calls processIngestBatch with correct arguments", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 5000 });
      mockDbResult = [{ lastIndex: 4900 }];
      mockProcessIngestBatch.mockResolvedValue({
        lastIndex: 5000,
        certsFound: 1,
        batchesRun: 1,
      });

      const req = makeRequest({ authorization: "Bearer test-secret" });
      await GET(req);

      expect(mockProcessIngestBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          startIndex: 4900,
          endIndex: 5000,
          maxBatches: 40,
          notify: true,
        }),
      );
    });

    it("uses startIndex of 0 when no cursor exists and processes batch", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 100 });
      // No cursor row in DB
      mockDbResult = [];
      mockProcessIngestBatch.mockResolvedValue({
        lastIndex: 100,
        certsFound: 0,
        batchesRun: 1,
      });

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("synced");
      expect(body.previousCursor).toBe(0);
      expect(body.behind).toBe(100);
      expect(mockProcessIngestBatch).toHaveBeenCalledWith(expect.objectContaining({ startIndex: 0, endIndex: 100 }));
    });
  });

  describe("error handling", () => {
    it("returns 500 when getSTH throws", async () => {
      mockGetSTH.mockRejectedValue(new Error("CT log unreachable"));

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Ingestion failed");
    });

    it("returns 500 when processIngestBatch throws", async () => {
      mockGetSTH.mockResolvedValue({ tree_size: 1000 });
      mockDbResult = [{ lastIndex: 900 }];
      mockProcessIngestBatch.mockRejectedValue(new Error("Batch processing error"));

      const req = makeRequest({ authorization: "Bearer test-secret" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Ingestion failed");
    });
  });
});
