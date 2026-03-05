/**
 * Check if a raw IP address (no brackets) falls within a private/internal range.
 * Works on both IPv4 and IPv6 addresses.
 */
export function isPrivateIP(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv6 loopback and private ranges
  if (
    lower === "::1" ||
    lower === "::0" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc00:") ||
    lower.startsWith("fd") ||
    lower.startsWith("2001:db8:") || // documentation range (2001:db8::/32)
    lower.startsWith("2001:0:") || // Teredo tunneling (2001::/32)
    lower.startsWith("2002:") || // 6to4 transition (2002::/16)
    lower.startsWith("fec0:") || // site-local (deprecated, fec0::/10)
    lower.startsWith("ff") || // multicast (ff00::/8)
    lower.startsWith("100::") // discard prefix (100::/64)
  ) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) — extract the IPv4 part and re-check
  const v4MappedMatch = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4MappedMatch) {
    return isPrivateIP(v4MappedMatch[1]);
  }

  // IPv4
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);

    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
    if (a === 0) return true; // 0.0.0.0/8
  }

  return false;
}

/**
 * Checks whether a hostname points to a private or internal network address.
 * Used to prevent SSRF in the SVG proxy and similar server-side fetchers.
 *
 * NOTE: This only checks the hostname string. For DNS rebinding protection
 * (where a public hostname resolves to a private IP), use safeFetch() from
 * @/lib/net/safe-fetch instead.
 */
export function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Loopback and well-known internal hostnames
  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower === "[::1]" ||
    lower === "[::0]" ||
    lower === "[0:0:0:0:0:0:0:0]" ||
    lower === "[0:0:0:0:0:0:0:1]" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".localhost") ||
    lower === "metadata.google.internal" ||
    lower === "metadata.google.com"
  ) {
    return true;
  }

  // Strip IPv6 brackets for numeric checks
  const bare = lower.startsWith("[") ? lower.slice(1, -1) : lower;

  return isPrivateIP(bare);
}
