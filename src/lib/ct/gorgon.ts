const BASE_URL = "https://gorgon.ct.digicert.com/log";
const USER_AGENT = "bimi-quest/1.0 (CT Log Scanner)";
const DEFAULT_DELAY_MS = 150;

export interface STHResponse {
  tree_size: number;
  timestamp: number;
  sha256_root_hash: string;
  tree_head_signature: string;
}

export interface CTLogEntry {
  leaf_input: string;
  extra_data: string;
}

interface GetEntriesResponse {
  entries: CTLogEntry[];
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.ok) return res;

    // Rate limited or server error, back off
    if (res.status === 429 || res.status >= 500) {
      const backoff = delay * Math.pow(2, attempt);
      console.warn(
        `Gorgon returned ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
      );
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    throw new Error(`Gorgon API error: ${res.status} ${res.statusText}`);
  }

  throw new Error(`Gorgon API failed after ${retries} retries`);
}

/** Get the current Signed Tree Head */
export async function getSTH(): Promise<STHResponse> {
  const res = await fetchWithRetry(`${BASE_URL}/ct/v1/get-sth`);
  return res.json();
}

/** Fetch a batch of log entries. Max 1000 per request. */
export async function getEntries(
  start: number,
  end: number
): Promise<GetEntriesResponse> {
  const res = await fetchWithRetry(
    `${BASE_URL}/ct/v1/get-entries?start=${start}&end=${end}`
  );
  return res.json();
}

/** Sleep utility for throttling between batch requests */
export function throttle(ms = DEFAULT_DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
