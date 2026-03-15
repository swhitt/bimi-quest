// Google CT Log List resolver — fetches and caches the public log_list.json,
// providing a lookup from base64 log ID to human-readable log metadata.

export interface CTLogInfo {
  description: string;
  url: string;
  operator: string;
  state: string; // "usable" | "readonly" | "retired" | "pending" | "qualified"
  mmd: number; // Maximum Merge Delay in seconds
}

interface LogListLog {
  description: string;
  log_id: string; // base64
  key: string;
  url?: string;
  submission_url?: string;
  mmd: number;
  state?: Record<string, { timestamp: string }>;
}

interface LogListOperator {
  name: string;
  logs: LogListLog[];
  tiled_logs?: LogListLog[];
}

interface LogListJson {
  operators: LogListOperator[];
}

const LOG_LIST_URL = "https://www.gstatic.com/ct/log_list/v3/all_logs_list.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Logs not in Google's public list (e.g. DigiCert's private Gorgon log)
const KNOWN_EXTRA_LOGS: [string, CTLogInfo][] = [
  [
    "VVlTrjCWAIBs0utSCKbJnpMYKKwQVrRCHFU2FUxfdaw=",
    {
      description: "DigiCert 'Gorgon' log",
      url: "https://gorgon.ct.digicert.com/log",
      operator: "DigiCert",
      state: "usable",
      mmd: 86400,
    },
  ],
];

let cachedMap: Map<string, CTLogInfo> | null = null;
let cachedAt = 0;

function resolveState(log: LogListLog): string {
  if (!log.state) return "unknown";
  // State object has a single key like "usable", "readonly", "retired"
  const keys = Object.keys(log.state);
  return keys[0] || "unknown";
}

/**
 * Fetch the Google CT log list and build a Map<base64_log_id, CTLogInfo>.
 * Results are cached in memory for 24 hours.
 */
export async function getLogList(): Promise<Map<string, CTLogInfo>> {
  if (cachedMap && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedMap;
  }

  const res = await fetch(LOG_LIST_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch CT log list: ${res.status} ${res.statusText}`);
  }

  const data: LogListJson = await res.json();
  const map = new Map<string, CTLogInfo>(KNOWN_EXTRA_LOGS);

  for (const op of data.operators) {
    const allLogs = [...(op.logs ?? []), ...(op.tiled_logs ?? [])];
    for (const log of allLogs) {
      map.set(log.log_id, {
        description: log.description,
        url: log.url ?? log.submission_url ?? "",
        operator: op.name,
        state: resolveState(log),
        mmd: log.mmd,
      });
    }
  }

  cachedMap = map;
  cachedAt = Date.now();
  return map;
}

/**
 * Look up a single log ID. Returns null if the log is not in the list.
 */
export async function resolveLogId(logId: string): Promise<CTLogInfo | null> {
  const map = await getLogList();
  return map.get(logId) ?? null;
}
