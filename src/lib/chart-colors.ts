"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// HSL colors that work as SVG fill attributes in both light and dark mode
const LIGHT_COLORS: Record<string, string> = {
  DigiCert: "hsl(221, 83%, 53%)",
  Entrust: "hsl(160, 60%, 45%)",
  GlobalSign: "hsl(35, 92%, 50%)",
  "SSL.com": "hsl(262, 83%, 58%)",
  Sectigo: "hsl(0, 72%, 51%)",
};

const DARK_COLORS: Record<string, string> = {
  DigiCert: "hsl(217, 91%, 60%)",
  Entrust: "hsl(160, 70%, 50%)",
  GlobalSign: "hsl(38, 92%, 55%)",
  "SSL.com": "hsl(270, 76%, 65%)",
  Sectigo: "hsl(4, 90%, 58%)",
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
  return colors[ca] || "hsl(0, 0%, 55%)";
}
