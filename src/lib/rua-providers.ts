/** Map RUA report destination hostnames to their product/company name */
const EXACT_PROVIDERS: Record<string, string> = {
  "vali.email": "Valimail",
  "emaildefense.proofpoint.com": "Proofpoint",
  "dmarc-reports.cloudflare.net": "Cloudflare",
  "inbox.ondmarc.com": "Red Sift OnDMARC",
  "rep.dmarcanalyzer.com": "DMARC Analyzer (Mimecast)",
  "dmarc.everest.email": "Everest (Validity)",
  "rua.powerdmarc.com": "PowerDMARC",
  "rua.agari.com": "Agari (Fortra)",
  "mxtoolbox.dmarc-report.com": "MXToolbox",
  "dmarc.postmarkapp.com": "Postmark (ActiveCampaign)",
  "inbound.dmarcdigests.com": "DMARC Digests",
  "dmarc25.jp": "DMARC25",
  "progist.in": "Progist",
  "dmarc.inboxmonster.com": "Inbox Monster",
  "rua.dmarc.emailanalyst.com": "Email Analyst",
  "sdmarc.net": "sDMARC",
  "ar.glockapps.com": "GlockApps",
  "dmarc.250ok.net": "250ok (Validity)",
  "in.mailhardener.com": "Mailhardener",
  "rx.rakuten.co.jp": "Rakuten",
  "dmarc.brevo.com": "Brevo (Sendinblue)",
  "rua.netcraft.com": "Netcraft",
  "rua.dmp.cisco.com": "Cisco Domain Protection",
  "dmarc-report.uriports.com": "URIports",
  "dmarc.fraudmarc.com": "Fraudmarc",
};

/** Suffix-based matching for companies with multiple subdomains (e.g. *.dmarcian.com) */
const SUFFIX_PROVIDERS: [string, string][] = [
  ["dmarcian.com", "dmarcian"],
  ["dmarcadvisor.com", "DMARC Advisor"],
  ["dmarcly.com", "DMARCLY"],
  ["easydmarc.us", "EasyDMARC"],
  ["easydmarc.eu", "EasyDMARC"],
  ["redsift.cloud", "Red Sift OnDMARC"],
];

/**
 * Extract all hostnames from mailto: URIs in an RUA value.
 * RUA values look like: "mailto:dmarc@vali.email" or "mailto:a@b.com,mailto:c@d.com"
 */
function extractRuaHostnames(rua: string): string[] {
  const matches = rua.matchAll(/mailto:[^@,]+@([^,!;\s]+)/gi);
  return [...matches].map((m) => m[1].toLowerCase());
}

/** Resolve a single hostname to a provider name */
function resolveHostname(hostname: string): string | null {
  if (EXACT_PROVIDERS[hostname]) return EXACT_PROVIDERS[hostname];
  for (const [suffix, name] of SUFFIX_PROVIDERS) {
    if (hostname === suffix || hostname.endsWith(`.${suffix}`)) return name;
  }
  return null;
}

/**
 * Resolve RUA tag value to all known report processor company names.
 * Returns deduplicated list preserving order of appearance.
 */
export function resolveRuaProviders(rua: string | null): string[] {
  if (!rua) return [];
  const hostnames = extractRuaHostnames(rua);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const hostname of hostnames) {
    const name = resolveHostname(hostname);
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/** Combined lookup table for chart tooltip display (hostname → company name) */
export const PROVIDER_NAMES: Record<string, string> = {
  ...EXACT_PROVIDERS,
  "ag.dmarcian.com": "dmarcian",
  "ag.us.dmarcian.com": "dmarcian",
  "ag.eu.dmarcian.com": "dmarcian",
  "ag.dmarcly.com": "DMARCLY",
  "ag.eu.dmarcadvisor.com": "DMARC Advisor",
  "rua.easydmarc.us": "EasyDMARC",
  "rua.easydmarc.eu": "EasyDMARC",
  "inbox.eu.redsift.cloud": "Red Sift OnDMARC",
};

/**
 * Best ILIKE search term for a provider name (used for chart click-through).
 * For suffix-based providers, returns the suffix so `contains:dmarcian.com`
 * matches all of ag.dmarcian.com, ag.us.dmarcian.com, ag.eu.dmarcian.com.
 */
const PROVIDER_FILTER_TERMS: Record<string, string> = {};
// Build reverse map: provider name → suffix (for multi-hostname providers)
for (const [suffix, name] of SUFFIX_PROVIDERS) {
  // Keep the shortest suffix per provider (e.g. EasyDMARC has easydmarc.us and easydmarc.eu — keep "easydmarc")
  const existing = PROVIDER_FILTER_TERMS[name];
  if (!existing || suffix.length < existing.length) {
    PROVIDER_FILTER_TERMS[name] = suffix;
  }
}

/**
 * Get the best `contains` filter term for a provider.
 * Falls back to the first hostname if no suffix-based term exists.
 */
export function providerFilterTerm(providerName: string, hostnames: string[]): string {
  return PROVIDER_FILTER_TERMS[providerName] ?? hostnames[0] ?? providerName;
}
