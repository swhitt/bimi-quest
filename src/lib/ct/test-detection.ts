/**
 * Detect whether a BIMI certificate is a test/demo cert based on its SANs.
 *
 * Test certs are issued against known CA testing domains or subdomains
 * with test-indicator labels (test.example.com, bimitest.example.com).
 *
 * False-positive safe: 2-label domains like hytest.com or testmail.jp
 * are NOT flagged because the "test" is part of the registrable domain,
 * not a subdomain label.
 */

// Domains that exist solely for CA testing purposes
const KNOWN_TEST_DOMAINS = [
  "testcertificates.com",
  "grapefruitdesk.com",
  "r-bimi-test.com",
  "ssl-test-5.com",
  "usaatest.com",
  "kaltiretest.com",
  "carmaxtest.com",
  "isastaging.com",
];

// Subdomain labels indicating test usage.
// Matches exact: "test", "staging", "sandbox"
// Matches separator + test: "bimi-test", "mail-test", etc.
// Matches compound suffix with 4+ char prefix: "bimitest", "dominomailtest"
// (4-char minimum avoids English words like "contest", "protest", "latest")
const TEST_LABEL_RE = /^(test|staging|sandbox)$|[-_]test|.{4,}test$/i;

function isTestDomain(domain: string): boolean {
  const lower = domain.toLowerCase();

  // Known test domains (exact or subdomain of)
  for (const td of KNOWN_TEST_DOMAINS) {
    if (lower === td || lower.endsWith(`.${td}`)) return true;
  }

  // For 3+ label domains, check if any subdomain label is a test indicator.
  // Skip the last 2 labels (registrable domain) to avoid false positives
  // on companies with "test" in their name (hytest.com, testdouble.com).
  const labels = lower.split(".");
  if (labels.length >= 3) {
    for (let i = 0; i < labels.length - 2; i++) {
      if (TEST_LABEL_RE.test(labels[i])) return true;
    }
  }

  return false;
}

/** Returns true if the cert's SAN list indicates it's a test certificate. */
export function isTestCert(sanList: string[]): boolean {
  if (sanList.length === 0) return false;
  return sanList.every(isTestDomain);
}
