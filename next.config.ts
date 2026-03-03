import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_COMMIT_SHA ?? "",
  },
  // Allow SVG images from any domain via our proxy
  images: {
    remotePatterns: [],
  },
  // Node.js APIs needed for BIMI validation (dns/promises)
  serverExternalPackages: ["@peculiar/x509", "xmllint-wasm", "isomorphic-dompurify", "jsdom"],
  outputFileTracingIncludes: {
    "/api/*": ["./src/lib/bimi/svg-tiny-ps.rng"],
    "/validate": ["./src/lib/bimi/svg-tiny-ps.rng"],
    "/certificates/*": ["./src/lib/bimi/svg-tiny-ps.rng"],
  },
  async rewrites() {
    return [{ source: "/certificates/page/:page", destination: "/certificates?page=:page" }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=300" }],
      },
    ];
  },
};

export default nextConfig;
