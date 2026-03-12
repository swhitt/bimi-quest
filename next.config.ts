import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // Allow SVG images from any domain via our proxy
  images: {
    remotePatterns: [],
  },
  // Node.js APIs needed for BIMI validation (dns/promises)
  serverExternalPackages: ["@peculiar/x509", "xmllint-wasm", "jsdom"],
  outputFileTracingIncludes: {
    "/api/*": ["./src/lib/bimi/svg-tiny-ps.rng"],
    "/validate": ["./src/lib/bimi/svg-tiny-ps.rng"],
    "/certificates/*": ["./src/lib/bimi/svg-tiny-ps.rng"],
  },
  async redirects() {
    return [];
  },
  async rewrites() {
    return [
      { source: "/certificates/page/:page", destination: "/certificates?page=:page" },
      { source: "/certificates/ca/:slug", destination: "/certificates?ca=:slug" },
      { source: "/certificates/ca/:slug/page/:page", destination: "/certificates?ca=:slug&page=:page" },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "font-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    ];
    // HSTS only in production — setting it on localhost permanently forces the browser to HTTPS
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=300" }],
      },
    ];
  },
};

export default nextConfig;
