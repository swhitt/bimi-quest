"use client";

import { useTheme } from "next-themes";

// --- Cert-type colors (VMC / CMC) ---
// Hues sit in the two widest gaps of the CA palette (25, 65, 165, 230, 290):
//   VMC → 145 (emerald, between GlobalSign 65 and Entrust 165)
//   CMC → 350 (rose, between SSL.com 290 and Sectigo 25)
// VMC is the dominant type (92%), so it uses lower chroma to stay calm;
// CMC is the minority (8%), so higher chroma draws the eye to it.
export const CERT_TYPE_COLORS = {
  light: { VMC: "oklch(0.52 0.12 145)", CMC: "oklch(0.55 0.155 350)" },
  dark: { VMC: "oklch(0.72 0.12 145)", CMC: "oklch(0.75 0.155 350)" },
} as const;

// --- CA colors matching the chart tokens in globals.css ---
const LIGHT_CA_COLORS: Record<string, string> = {
  DigiCert: "oklch(0.55 0.15 230)",
  Entrust: "oklch(0.60 0.14 165)",
  GlobalSign: "oklch(0.70 0.16 65)",
  "SSL.com": "oklch(0.55 0.15 290)",
  Sectigo: "oklch(0.60 0.20 25)",
};

const DARK_CA_COLORS: Record<string, string> = {
  DigiCert: "oklch(0.60 0.17 230)",
  Entrust: "oklch(0.65 0.14 165)",
  GlobalSign: "oklch(0.75 0.16 65)",
  "SSL.com": "oklch(0.60 0.17 290)",
  Sectigo: "oklch(0.65 0.22 25)",
};

export const CA_COLOR_INDEX: Record<string, number> = {
  DigiCert: 1,
  Entrust: 2,
  GlobalSign: 3,
  "SSL.com": 4,
  Sectigo: 5,
};

export function useChartColors(): Record<string, string> {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? LIGHT_CA_COLORS : DARK_CA_COLORS;
}

export function useCertTypeColors(): { VMC: string; CMC: string } {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? CERT_TYPE_COLORS.light : CERT_TYPE_COLORS.dark;
}

export function getCAColor(colors: Record<string, string>, ca: string): string {
  return colors[ca] || "oklch(0.55 0 0)";
}
