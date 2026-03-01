import { promises as dns } from "dns";
import { isPrivateIP, isPrivateHostname } from "./hostname";

/**
 * Fetch wrapper that resolves DNS before connecting and validates all resolved
 * IPs against private/internal ranges. Prevents DNS rebinding attacks where an
 * attacker registers a public domain that resolves to a private IP.
 */
export async function safeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url);

  // Reject non-HTTPS (except in tests)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  // Quick hostname string check first
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`Refusing to fetch from private/internal host: ${parsed.hostname}`);
  }

  // Resolve DNS and validate all IPs
  await validateResolvedIPs(parsed.hostname);

  return fetch(url, init);
}

/**
 * Resolve a hostname's A and AAAA records and throw if any resolve to a
 * private/internal IP address.
 */
async function validateResolvedIPs(hostname: string): Promise<void> {
  // If the hostname is already an IP literal, just check it directly
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Resolved IP is private/internal: ${hostname}`);
    }
    return;
  }

  const results = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);

  const ips: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      ips.push(...result.value);
    }
  }

  // If we got zero IPs from both, the domain doesn't resolve
  if (ips.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      throw new Error(`DNS rebinding blocked: ${hostname} resolved to private IP ${ip}`);
    }
  }
}
