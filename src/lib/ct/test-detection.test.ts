import { describe, expect, it } from "vitest";
import { isTestCert } from "./test-detection";

describe("isTestCert", () => {
  describe("known test domains", () => {
    it("flags testcertificates.com", () => {
      expect(isTestCert(["testcertificates.com"])).toBe(true);
    });

    it("flags subdomains of testcertificates.com", () => {
      expect(isTestCert(["san1.testcertificates.com"])).toBe(true);
      expect(isTestCert(["a121336112943.vmc1--dra.testcertificates.com"])).toBe(true);
    });

    it("flags grapefruitdesk.com and subdomains", () => {
      expect(isTestCert(["grapefruitdesk.com"])).toBe(true);
      expect(isTestCert(["san1.grapefruitdesk.com"])).toBe(true);
      expect(isTestCert(["a1241516107.grapefruitdesk.com"])).toBe(true);
    });

    it("flags r-bimi-test.com and subdomains", () => {
      expect(isTestCert(["r-bimi-test.com"])).toBe(true);
      expect(isTestCert(["logo-test01.r-bimi-test.com"])).toBe(true);
    });

    it("flags other known test domains", () => {
      expect(isTestCert(["ssl-test-5.com"])).toBe(true);
      expect(isTestCert(["usaatest.com"])).toBe(true);
      expect(isTestCert(["kaltiretest.com"])).toBe(true);
      expect(isTestCert(["carmaxtest.com"])).toBe(true);
      expect(isTestCert(["isastaging.com"])).toBe(true);
    });
  });

  describe("test subdomain patterns", () => {
    it("flags 'test' as subdomain label", () => {
      expect(isTestCert(["test.bnpparibas.com"])).toBe(true);
    });

    it("flags 'staging' as subdomain label", () => {
      expect(isTestCert(["staging.example.com"])).toBe(true);
    });

    it("flags 'sandbox' as subdomain label", () => {
      expect(isTestCert(["sandbox.company.org"])).toBe(true);
    });

    it("flags compound labels ending in 'test' (bimitest, dominomailtest)", () => {
      expect(isTestCert(["bimitest.effem.com"])).toBe(true);
      expect(isTestCert(["dominomailtest.discoverfinancial.com"])).toBe(true);
      expect(isTestCert(["myteamgetest.teamglobalexp.com"])).toBe(true);
    });

    it("flags hyphenated test labels", () => {
      expect(isTestCert(["bimi-test.example.com"])).toBe(true);
      expect(isTestCert(["mail-test.company.org"])).toBe(true);
    });
  });

  describe("false positive avoidance", () => {
    it("does NOT flag 2-label domains with 'test' in the name", () => {
      expect(isTestCert(["hytest.com"])).toBe(false);
      expect(isTestCert(["testmail.jp"])).toBe(false);
      expect(isTestCert(["testdouble.com"])).toBe(false);
      expect(isTestCert(["testlify.com"])).toBe(false);
    });

    it("does NOT flag real company domains", () => {
      expect(isTestCert(["paypal.com"])).toBe(false);
      expect(isTestCert(["digicert.com"])).toBe(false);
      expect(isTestCert(["rakuten.co.jp"])).toBe(false);
      expect(isTestCert(["mailer.netflix.com"])).toBe(false);
    });

    it("does NOT flag English words ending in 'test' as subdomain labels", () => {
      expect(isTestCert(["contest.company.com"])).toBe(false);
      expect(isTestCert(["protest.company.com"])).toBe(false);
      expect(isTestCert(["latest.company.com"])).toBe(false);
    });

    it("does NOT flag 'demo' in company names (modemobile)", () => {
      expect(isTestCert(["modemobile.com"])).toBe(false);
    });
  });

  describe("multi-SAN behavior", () => {
    it("returns true only when ALL SANs are test domains", () => {
      expect(isTestCert(["san1.testcertificates.com", "san2.testcertificates.com"])).toBe(true);
    });

    it("returns false when any SAN is a real domain", () => {
      expect(isTestCert(["test.bnpparibas.com", "bnpparibas.com"])).toBe(false);
    });

    it("returns false for empty SAN list", () => {
      expect(isTestCert([])).toBe(false);
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase domains", () => {
      expect(isTestCert(["SAN1.TESTCERTIFICATES.COM"])).toBe(true);
      expect(isTestCert(["TEST.BnpParibas.com"])).toBe(true);
    });
  });
});
