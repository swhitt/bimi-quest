"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// OKLCH colors matching the chart tokens in globals.css
const LIGHT_COLORS: Record<string, string> = {
  DigiCert: "oklch(0.55 0.15 230)",
  Entrust: "oklch(0.60 0.14 165)",
  GlobalSign: "oklch(0.70 0.16 65)",
  "SSL.com": "oklch(0.55 0.15 290)",
  Sectigo: "oklch(0.60 0.20 25)",
};

const DARK_COLORS: Record<string, string> = {
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
  const [colors, setColors] = useState<Record<string, string>>(LIGHT_COLORS);

  useEffect(() => {
    setColors(resolvedTheme === "dark" ? DARK_COLORS : LIGHT_COLORS);
  }, [resolvedTheme]);

  return colors;
}

export function getCAColor(
  colors: Record<string, string>,
  ca: string
): string {
  return colors[ca] || "oklch(0.55 0 0)";
}
