import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import {
  INDUSTRIES,
  scoreNotability,
  scoreNotabilityBatch,
  classifyIndustryBatch,
  type BrandInput,
} from "./notability";

/** Helper: build a mock API response containing a tool_use block */
function toolUseResponse(name: string, input: Record<string, unknown>) {
  return {
    content: [{ type: "tool_use" as const, id: "call_1", name, input }],
  };
}

let savedApiKey: string | undefined;

beforeEach(() => {
  savedApiKey = process.env.ANTHROPIC_API_KEY;
  mockCreate.mockReset();
});

afterEach(() => {
  if (savedApiKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = savedApiKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

describe("INDUSTRIES", () => {
  it("is non-empty", () => {
    expect(INDUSTRIES.length).toBeGreaterThan(0);
  });

  it("contains 'Technology'", () => {
    expect(INDUSTRIES).toContain("Technology");
  });

  it("contains 'Finance'", () => {
    expect(INDUSTRIES).toContain("Finance");
  });

  it("contains 'Other' as a catch-all", () => {
    expect(INDUSTRIES).toContain("Other");
  });
});

describe("scoreNotability", () => {
  it("returns null when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await scoreNotability("Acme Corp", ["acme.com"], "US");
    expect(result).toBeNull();
  });

  it("returns null when org is null", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = await scoreNotability(null, ["acme.com"], "US");
    expect(result).toBeNull();
  });

  it("returns a normalized result on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: 7.6,
        reason: "Well-known tech company",
        description: "Cloud infrastructure provider",
        industry: "Technology",
      }),
    );

    const result = await scoreNotability("Cloudflare", ["cloudflare.com"], "US");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(8); // 7.6 rounded to 8
    expect(result!.reason).toBe("Well-known tech company");
    expect(result!.industry).toBe("Technology");
  });

  it("clamps scores below 1 to 1", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: -5,
        reason: "Unknown",
        description: "Unknown entity",
        industry: "Other",
      }),
    );

    const result = await scoreNotability("Nobody", ["nobody.test"], null);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(1);
  });

  it("clamps scores above 10 to 10", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: 15,
        reason: "Famous",
        description: "Mega corp",
        industry: "Technology",
      }),
    );

    const result = await scoreNotability("MegaCorp", ["mega.com"], "US");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(10);
  });

  it("normalizes unknown industry to 'Other'", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: 5,
        reason: "Mid-market company",
        description: "Does stuff",
        industry: "Widgets & Gadgets",
      }),
    );

    const result = await scoreNotability("WidgetCo", ["widget.co"], "US");
    expect(result).not.toBeNull();
    expect(result!.industry).toBe("Other");
  });

  it("passes through a valid industry", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: 8,
        reason: "Major bank",
        description: "Financial institution",
        industry: "Finance",
      }),
    );

    const result = await scoreNotability("HSBC", ["hsbc.com"], "GB");
    expect(result).not.toBeNull();
    expect(result!.industry).toBe("Finance");
  });
});

describe("scoreNotabilityBatch", () => {
  it("returns empty map when no brands", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = await scoreNotabilityBatch([]);
    expect(result.size).toBe(0);
  });

  it("delegates to single call for 1 brand", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability", {
        score: 6,
        reason: "Known regionally",
        description: "Regional bank",
        industry: "Finance",
      }),
    );

    const brands: BrandInput[] = [{ id: "1", org: "Regional Bank", domain: "regional.com", country: "US" }];
    const result = await scoreNotabilityBatch(brands);
    expect(result.size).toBe(1);
    expect(result.get("1")!.score).toBe(6);

    // Verify single tool was used (tool_choice references the single tool name)
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tool_choice.name).toBe("score_notability");
  });

  it("returns results for multiple brands", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("score_notability_batch", {
        results: [
          { id: "a", score: 9, reason: "Global tech giant", description: "Search engine", industry: "Technology" },
          { id: "b", score: 3, reason: "Small shop", description: "Local business", industry: "Retail" },
        ],
      }),
    );

    const brands: BrandInput[] = [
      { id: "a", org: "Google", domain: "google.com", country: "US" },
      { id: "b", org: "Corner Shop", domain: "shop.local", country: "GB" },
    ];
    const result = await scoreNotabilityBatch(brands);
    expect(result.size).toBe(2);
    expect(result.get("a")!.score).toBe(9);
    expect(result.get("b")!.score).toBe(3);
  });

  it("returns empty map when API key is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const brands: BrandInput[] = [
      { id: "1", org: "Test", domain: "test.com", country: "US" },
      { id: "2", org: "Test2", domain: "test2.com", country: "US" },
    ];
    const result = await scoreNotabilityBatch(brands);
    expect(result.size).toBe(0);
  });
});

describe("classifyIndustryBatch", () => {
  it("returns empty map when no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const brands: BrandInput[] = [{ id: "1", org: "Test", domain: "test.com", country: "US" }];
    const result = await classifyIndustryBatch(brands);
    expect(result.size).toBe(0);
  });

  it("returns empty map when no brands", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = await classifyIndustryBatch([]);
    expect(result.size).toBe(0);
  });

  it("classifies brands with valid industries", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("classify_industry_batch", {
        results: [
          { id: "x", industry: "Technology" },
          { id: "y", industry: "Finance" },
        ],
      }),
    );

    const brands: BrandInput[] = [
      { id: "x", org: "TechCo", domain: "tech.co", country: "US" },
      { id: "y", org: "BankCo", domain: "bank.co", country: "GB" },
    ];
    const result = await classifyIndustryBatch(brands);
    expect(result.size).toBe(2);
    expect(result.get("x")).toBe("Technology");
    expect(result.get("y")).toBe("Finance");
  });

  it("normalizes unknown industry to 'Other'", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue(
      toolUseResponse("classify_industry_batch", {
        results: [{ id: "z", industry: "Space Exploration" }],
      }),
    );

    const brands: BrandInput[] = [{ id: "z", org: "SpaceX", domain: "spacex.com", country: "US" }];
    const result = await classifyIndustryBatch(brands);
    expect(result.get("z")).toBe("Other");
  });
});
