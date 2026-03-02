import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BIMI Quest",
    short_name: "BIMI Quest",
    description:
      "Track VMC and CMC certificate issuances across all Certificate Authorities. Real-time BIMI market intelligence from CT logs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C1222",
    theme_color: "#0C1222",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
