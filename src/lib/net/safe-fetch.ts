import { promises as dns } from "dns";
import { Agent } from "undici";
import { withDnsTimeout } from "@/lib/bimi/dns-utils";
import { isPrivateHostname, isPrivateIP } from "./hostname";

/**
 * Fetch wrapper that resolves DNS, validates all IPs against SSRF,
 * then uses an undici Agent with a custom DNS lookup to pin the
 * connection to the validated IP.
 *
 * Unlike URL-rewriting approaches, this preserves the original hostname
 * in the URL so TLS SNI is sent correctly — critical for CDN-hosted
 * domains where the server selects its certificate based on SNI.
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

  // Use an undici Agent with a custom DNS lookup that returns the
  // pre-validated IP. This pins the connection to the safe IP while
  // keeping the original hostname in the URL for correct TLS SNI.
  const dispatcher = resolvedIP
    ? new Agent({
        connect: {
          lookup: (_hostname, _options, callback) => {
            callback(null, [{ address: resolvedIP, family: resolvedIP.includes(":") ? 6 : 4 }]);
          },
        },
      })
    : undefined;

  return fetch(parsed.toString(), {
    ...init,
    // Block redirects: a redirect from a public URL to an internal IP
    // would bypass our DNS validation.
    redirect: "error",
    // @ts-expect-error -- dispatcher is a valid undici option for Node.js fetch
    dispatcher,
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

  const results = await Promise.allSettled([
    withDnsTimeout(dns.resolve4(hostname)),
    withDnsTimeout(dns.resolve6(hostname)),
  ]);

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
