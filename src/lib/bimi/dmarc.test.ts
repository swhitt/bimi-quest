import { describe, it, expect } from "vitest";
import { parseDMARCRecord, isDMARCValidForBIMI, getDMARCBIMIReason, getOrgDomain } from "./dmarc";

describe("parseDMARCRecord", () => {
  it("parses a basic DMARC record", () => {
    const result = parseDMARCRecord("v=DMARC1; p=reject; rua=mailto:dmarc@example.com");
    expect(result.version).toBe("DMARC1");
    expect(result.policy).toBe("reject");
    expect(result.pct).toBe(100); // default
    expect(result.rua).toBe("mailto:dmarc@example.com");
    expect(result.ruf).toBeNull();
    expect(result.sp).toBeNull();
  });

  it("parses pct and sp tags", () => {
    const result = parseDMARCRecord("v=DMARC1; p=quarantine; pct=50; sp=reject");
    expect(result.policy).toBe("quarantine");
    expect(result.pct).toBe(50);
    expect(result.sp).toBe("reject");
  });

  it("handles none policy", () => {
    const result = parseDMARCRecord("v=DMARC1; p=none");
    expect(result.policy).toBe("none");
  });

  it("handles extra whitespace", () => {
    const result = parseDMARCRecord("v=DMARC1 ;  p=reject ;  pct=100");
    expect(result.policy).toBe("reject");
    expect(result.pct).toBe(100);
  });
});

describe("isDMARCValidForBIMI", () => {
  it("accepts p=reject with pct=100", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject");
    expect(isDMARCValidForBIMI(record)).toBe(true);
  });

  it("accepts p=quarantine with pct=100", () => {
    const record = parseDMARCRecord("v=DMARC1; p=quarantine");
    expect(isDMARCValidForBIMI(record)).toBe(true);
  });

  it("rejects p=none", () => {
    const record = parseDMARCRecord("v=DMARC1; p=none");
    expect(isDMARCValidForBIMI(record)).toBe(false);
  });

  it("rejects pct < 100", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject; pct=50");
    expect(isDMARCValidForBIMI(record)).toBe(false);
  });

  it("uses sp for subdomains when present", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject; sp=none");
    expect(isDMARCValidForBIMI(record, false)).toBe(true);
    expect(isDMARCValidForBIMI(record, true)).toBe(false);
  });

  it("falls back to p when sp not present for subdomains", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject");
    expect(isDMARCValidForBIMI(record, true)).toBe(true);
  });
});

describe("getDMARCBIMIReason", () => {
  it("returns null for valid p=reject", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject");
    expect(getDMARCBIMIReason(record)).toBeNull();
  });

  it("returns null for valid p=quarantine", () => {
    const record = parseDMARCRecord("v=DMARC1; p=quarantine");
    expect(getDMARCBIMIReason(record)).toBeNull();
  });

  it("returns policy reason for p=none", () => {
    const record = parseDMARCRecord("v=DMARC1; p=none");
    expect(getDMARCBIMIReason(record)).toBe("Policy is 'none', must be 'quarantine' or 'reject'");
  });

  it("returns pct reason when pct < 100", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject; pct=50");
    expect(getDMARCBIMIReason(record)).toBe("pct=50, must be 100");
  });

  it("returns sp=none subdomain reason when isSubdomain and sp=none", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject; sp=none");
    expect(getDMARCBIMIReason(record, true)).toBe("sp=none explicitly blocks BIMI for subdomains");
  });

  it("returns null for subdomain when sp=reject", () => {
    const record = parseDMARCRecord("v=DMARC1; p=none; sp=reject");
    expect(getDMARCBIMIReason(record, true)).toBeNull();
  });

  it("falls back to p= for subdomain when sp not set", () => {
    const record = parseDMARCRecord("v=DMARC1; p=reject");
    expect(getDMARCBIMIReason(record, true)).toBeNull();
  });

  it("returns policy reason for subdomain falling back to p=none", () => {
    const record = parseDMARCRecord("v=DMARC1; p=none");
    expect(getDMARCBIMIReason(record, true)).toBe("Policy is 'none', must be 'quarantine' or 'reject'");
  });
});

describe("getOrgDomain", () => {
  it("returns null for bare domains", () => {
    expect(getOrgDomain("example.com")).toBeNull();
    expect(getOrgDomain("google.com")).toBeNull();
  });

  it("extracts org domain from subdomains", () => {
    expect(getOrgDomain("mail.example.com")).toBe("example.com");
    expect(getOrgDomain("deep.sub.example.com")).toBe("example.com");
  });

  it("handles two-part TLDs correctly", () => {
    expect(getOrgDomain("mail.example.co.uk")).toBe("example.co.uk");
    expect(getOrgDomain("shop.example.com.au")).toBe("example.com.au");
    expect(getOrgDomain("app.example.co.jp")).toBe("example.co.jp");
  });

  it("returns null for TLDs alone", () => {
    expect(getOrgDomain("com")).toBeNull();
    expect(getOrgDomain("co.uk")).toBeNull();
  });

  it("handles deeply nested subdomains", () => {
    expect(getOrgDomain("a.b.c.example.com")).toBe("example.com");
    expect(getOrgDomain("deep.sub.example.co.uk")).toBe("example.co.uk");
  });
});
