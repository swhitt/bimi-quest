export interface CrtshResult {
  id: number;
  issuer_ca_id: number;
  issuer_name: string;
  common_name: string;
  name_value: string;
  serial_number: string;
  not_before: string;
  not_after: string;
  entry_timestamp: string;
}

const BASE_URL = "https://crt.sh";

// Rate limit: 1 request per second
let lastRequestTime = 0;
async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  lastRequestTime = Date.now();
}

export async function searchByFingerprint(
  sha256: string
): Promise<CrtshResult | null> {
  await rateLimit();
  try {
    const res = await fetch(
      `${BASE_URL}/?q=${encodeURIComponent(sha256)}&output=json`,
      { headers: { "User-Agent": "bimi-intel/1.0" } }
    );
    if (!res.ok) return null;
    const results: CrtshResult[] = await res.json();
    return results.length > 0 ? results[0] : null;
  } catch {
    return null;
  }
}

export async function searchByDomain(
  domain: string
): Promise<CrtshResult[]> {
  await rateLimit();
  try {
    const res = await fetch(
      `${BASE_URL}/?q=${encodeURIComponent(domain)}&output=json`,
      { headers: { "User-Agent": "bimi-intel/1.0" } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
