import { describe, expect, it } from "vitest";
import { parseBIMIRecord } from "./dns";

describe("parseBIMIRecord", () => {
  it("parses a standard record with logo and authority", () => {
    const record = parseBIMIRecord(
      "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem;"
    );
    expect(record.version).toBe("BIMI1");
    expect(record.logoUrl).toBe("https://example.com/logo.svg");
    expect(record.authorityUrl).toBe("https://example.com/vmc.pem");
    expect(record.declined).toBe(false);
    expect(record.lps).toBeNull();
    expect(record.avp).toBeNull();
    expect(record.selector).toBe("default");
    expect(record.orgDomainFallback).toBe(false);
    expect(record.orgDomain).toBeNull();
  });

  it("preserves the raw record", () => {
    const raw = "v=BIMI1; l=https://example.com/logo.svg;";
    expect(parseBIMIRecord(raw).raw).toBe(raw);
  });

  it("passes through the selector", () => {
    const record = parseBIMIRecord("v=BIMI1; l=;", "marketing");
    expect(record.selector).toBe("marketing");
  });

  describe("lps tag", () => {
    it("parses lps with a prefix list", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; lps=support,marketing,sales;"
      );
      expect(record.lps).toBe("support,marketing,sales");
    });

    it("parses empty lps (allow all local-parts)", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; lps=;"
      );
      // Empty lps= means "allow all", stored as null (present but no value)
      expect(record.lps).toBeNull();
    });

    it("returns null when lps tag is absent", () => {
      const record = parseBIMIRecord("v=BIMI1; l=https://example.com/logo.svg;");
      expect(record.lps).toBeNull();
    });
  });

  describe("avp tag", () => {
    it("parses avp=brand", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; avp=brand;"
      );
      expect(record.avp).toBe("brand");
    });

    it("parses avp=personal", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; avp=personal;"
      );
      expect(record.avp).toBe("personal");
    });

    it("is case insensitive", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; avp=Brand;"
      );
      expect(record.avp).toBe("brand");
    });

    it("returns null for unknown avp values", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; avp=invalid;"
      );
      expect(record.avp).toBeNull();
    });

    it("returns null when avp is absent", () => {
      const record = parseBIMIRecord("v=BIMI1; l=https://example.com/logo.svg;");
      expect(record.avp).toBeNull();
    });
  });

  describe("declination detection", () => {
    it("detects declination when both l= and a= are empty", () => {
      const record = parseBIMIRecord("v=BIMI1; l=; a=;");
      expect(record.declined).toBe(true);
      expect(record.logoUrl).toBeNull();
      expect(record.authorityUrl).toBeNull();
    });

    it("is not declined when only l= is empty", () => {
      const record = parseBIMIRecord("v=BIMI1; l=; a=https://example.com/vmc.pem;");
      expect(record.declined).toBe(false);
    });

    it("is not declined when only a= is empty", () => {
      const record = parseBIMIRecord("v=BIMI1; l=https://example.com/logo.svg; a=;");
      expect(record.declined).toBe(false);
    });

    it("is not declined when a= is absent", () => {
      const record = parseBIMIRecord("v=BIMI1; l=;");
      expect(record.declined).toBe(false);
    });

    it("is not declined when both have values", () => {
      const record = parseBIMIRecord(
        "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem;"
      );
      expect(record.declined).toBe(false);
    });

    it("handles declination with lps tag present", () => {
      const record = parseBIMIRecord("v=BIMI1; l=; a=; lps=brand-;");
      expect(record.declined).toBe(true);
      expect(record.lps).toBe("brand-");
    });
  });
});
