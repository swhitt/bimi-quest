import { describe, it, expect } from "vitest";
import { buildApiParamsFromSearchParams } from "./global-filter-params";

describe("buildApiParamsFromSearchParams", () => {
  it("returns empty string for empty params", () => {
    expect(buildApiParamsFromSearchParams({})).toBe("");
  });

  it("handles a single param", () => {
    expect(buildApiParamsFromSearchParams({ ca: "DigiCert" })).toBe("ca=DigiCert");
  });

  it("includes multiple filter params", () => {
    const result = buildApiParamsFromSearchParams({ ca: "DigiCert", type: "VMC" });
    const parsed = new URLSearchParams(result);
    expect(parsed.get("ca")).toBe("DigiCert");
    expect(parsed.get("type")).toBe("VMC");
  });

  it("omits undefined values", () => {
    const result = buildApiParamsFromSearchParams({ ca: "DigiCert", type: undefined });
    expect(result).toBe("ca=DigiCert");
  });

  it("ignores array values (only string values used)", () => {
    const result = buildApiParamsFromSearchParams({ ca: ["DigiCert", "Entrust"] });
    expect(result).toBe("");
  });

  it("merges extra params", () => {
    const result = buildApiParamsFromSearchParams({ ca: "DigiCert" }, { limit: "50" });
    const parsed = new URLSearchParams(result);
    expect(parsed.get("ca")).toBe("DigiCert");
    expect(parsed.get("limit")).toBe("50");
  });

  it("extra params override base params", () => {
    const result = buildApiParamsFromSearchParams({ ca: "DigiCert" }, { ca: "Entrust" });
    const parsed = new URLSearchParams(result);
    expect(parsed.get("ca")).toBe("Entrust");
  });

  it("supports all known filter keys", () => {
    const all: Record<string, string> = {
      ca: "DigiCert",
      root: "DigiCert",
      type: "VMC",
      mark: "Registered",
      validity: "valid",
      from: "2024-01-01",
      to: "2024-12-31",
      country: "US",
      precert: "false",
      industry: "Technology",
    };
    const result = buildApiParamsFromSearchParams(all);
    const parsed = new URLSearchParams(result);
    for (const [key, value] of Object.entries(all)) {
      expect(parsed.get(key)).toBe(value);
    }
  });
});
