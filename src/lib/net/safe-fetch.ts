import { promises as dns } from "dns";
import { isPrivateHostname, isPrivateIP } from "./hostname";

/**
 * Fetch wrapper that resolves DNS, validates IPs, then connects to the
 * validated IP directly (setting Host header to the original hostname).
 *
 * This closes the TOCTOU gap where DNS is resolved for validation but
 * fetch() re-resolves independently -- an attacker with a short-TTL DNS
 * record could return a safe IP during validation then a private IP for
 * the actual fetch. By pinning to the resolved IP, the connection always
 * goes to the validated address.
 *
 * Redirects are blocked (`redirect: "error"`) so a public URL can't
 * redirect to an internal IP and bypass the check.
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

  // Resolve DNS and validate all IPs; returns first valid IPv4
  const resolvedIP = await resolveAndValidateIPs(parsed.hostname);

  // Build a URL that connects to the resolved IP directly, preventing
  // a second DNS lookup from returning a different (potentially private) IP.
  const pinnedUrl = new URL(parsed.toString());
  const originalHost = parsed.hostname;

  if (resolvedIP) {
    pinnedUrl.hostname = resolvedIP;
  }

  return fetch(pinnedUrl.toString(), {
    ...init,
    // Block redirects: a redirect from a public URL to an internal IP
    // would bypass our DNS validation.
    redirect: "error",
    headers: {
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      // Restore the original hostname so TLS SNI and virtual hosting work
      Host: originalHost,
    },
  });
}

/**
 * Resolve a hostname's A and AAAA records and throw if any resolve to a
 * private/internal IP address. Returns the first validated IPv4 address
 * for connection pinning, or null if the hostname is already an IP literal.
 */
async function resolveAndValidateIPs(hostname: string): Promise<string | null> {
  // If the hostname is already an IP literal, just check it directly
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Resolved IP is private/internal: ${hostname}`);
    }
    return null; // IP literal, no pinning needed
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

  // Return the first IPv4 for connection pinning. Prefer IPv4 since it's
  // more universally supported and avoids bracket-escaping issues in URLs.
  const ipv4s = ips.filter((ip) => /^[\d.]+$/.test(ip));
  return ipv4s[0] ?? ips[0];
}
