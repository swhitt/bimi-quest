import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow SVG images from any domain via our proxy
  images: {
    remotePatterns: [],
  },
  // Node.js APIs needed for BIMI validation (dns/promises)
  serverExternalPackages: ["@peculiar/x509"],
};

export default nextConfig;
