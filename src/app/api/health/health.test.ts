import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

// Holds the result the chainable query builder resolves to. Tests override
// this before calling GET to control what the DB "returns".
let mockDbResult: unknown[] = [];

// Controls whether the chain should reject instead of resolve. When set to a
// non-null Error the thenable rejects with that error, simulating a DB failure.
let mockDbError: Error | null = null;

// Builds a chainable query builder that is also thenable (awaitable). The
// chain resolves to `mockDbResult` unless `mockDbError` is set, in which case
// it rejects — which exercises the route's catch block.
const chainable = () => {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: Error) => void) => {
    if (mockDbError) {
      reject(mockDbError);
    } else {
      resolve(mockDbResult);
    }
  };
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
  ingestionCursors: {
    logName: "log_name",
    lastIndex: "last_index",
    lastRun: "last_run",
    treeSize: "tree_size",
  },
}));

vi.mock("@/lib/cache", () => ({
  CACHE_PRESETS: { SHORT: "public, s-maxage=60, stale-while-revalidate=300" },
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// Import route after all mocks are registered.
import { GET } from "./route";

// ── Helpers ─────────────────────────────────────────────────────────

/** Returns a Date that is `offsetMs` milliseconds in the past. */
function dateAgo(offsetMs: number): Date {
  return new Date(Date.now() - offsetMs);
}

const ONE_MINUTE_MS = 60 * 1000;
const SIXTEEN_MINUTES_MS = 16 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult = [];
  mockDbError = null;
});

// ── Tests ────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok when ingestion is fresh", async () => {
    const lastRunDate = dateAgo(ONE_MINUTE_MS);
    mockDbResult = [
      {
        lastIndex: 900,
        lastRun: lastRunDate,
        treeSize: 1000,
      },
    ];

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.ingestion).not.toBeNull();
    expect(body.ingestion.lastRun).toBe(lastRunDate.toISOString());
    // lagMs should be approximately 1 minute (within a 5 s tolerance)
    expect(body.ingestion.lagMs).toBeGreaterThan(0);
    expect(body.ingestion.lagMs).toBeLessThan(ONE_MINUTE_MS + 5000);
    expect(body.ingestion.behindEntries).toBe(100);
  });

  it("returns 503 with status degraded when ingestion is stale (lagMs > 15 min)", async () => {
    const lastRunDate = dateAgo(SIXTEEN_MINUTES_MS);
    mockDbResult = [
      {
        lastIndex: 500,
        lastRun: lastRunDate,
        treeSize: 600,
      },
    ];

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("connected");
    expect(body.ingestion).not.toBeNull();
    expect(body.ingestion.lastRun).toBe(lastRunDate.toISOString());
    // lagMs should be approximately 16 minutes (within a 5 s tolerance)
    expect(body.ingestion.lagMs).toBeGreaterThan(SIXTEEN_MINUTES_MS - 5000);
    expect(body.ingestion.lagMs).toBeLessThan(SIXTEEN_MINUTES_MS + 5000);
    expect(body.ingestion.behindEntries).toBe(100);
  });

  it("returns 503 with db unreachable when the DB throws", async () => {
    mockDbError = new Error("Connection refused");

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("unreachable");
    expect(body.ingestion).toBeNull();
  });

  it("returns null lagMs and null behindEntries when cursor row is missing", async () => {
    // Empty result — no cursor row exists yet
    mockDbResult = [];

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.ingestion.lastRun).toBeNull();
    expect(body.ingestion.lagMs).toBeNull();
    expect(body.ingestion.behindEntries).toBeNull();
  });

  it("calculates behindEntries correctly from treeSize and lastIndex", async () => {
    mockDbResult = [
      {
        lastIndex: 750,
        lastRun: dateAgo(ONE_MINUTE_MS),
        treeSize: 1000,
      },
    ];

    const res = await GET();
    const body = await res.json();
    expect(body.ingestion.behindEntries).toBe(250);
  });

  it("returns null behindEntries when treeSize is null", async () => {
    mockDbResult = [
      {
        lastIndex: 750,
        lastRun: dateAgo(ONE_MINUTE_MS),
        treeSize: null,
      },
    ];

    const res = await GET();
    const body = await res.json();
    expect(body.ingestion.behindEntries).toBeNull();
  });

  it("sets Cache-Control header on all responses", async () => {
    mockDbResult = [
      {
        lastIndex: 0,
        lastRun: dateAgo(ONE_MINUTE_MS),
        treeSize: 0,
      },
    ];

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it("sets Cache-Control header even on DB error responses", async () => {
    mockDbError = new Error("DB down");

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });
});
