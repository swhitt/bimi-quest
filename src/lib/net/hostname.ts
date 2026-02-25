/**
 * Checks whether a hostname points to a private or internal network address.
 * Used to prevent SSRF in the SVG proxy and similar server-side fetchers.
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

  // IPv6 loopback and link-local
  if (bare === "::1" || bare === "::0" || bare.startsWith("fe80:") || bare.startsWith("fc00:") || bare.startsWith("fd")) {
    return true;
  }

  // IPv4 checks: parse dotted-quad and check RFC 1918 / link-local / loopback ranges
  const ipv4Match = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
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
