"use client";

import { useCallback, useMemo, useState } from "react";
import { DARK_BG, isLightBg, LIGHT_BG, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";

export interface SmartBgResult {
  strippedSvg: string | null;
  bgColor: string;
  isLight: boolean;
  bgMode: "auto" | "dark" | "light";
  cycleBg: () => void;
  displaySvg: string | null;
}

/**
 * Extracts the smart background pipeline: strip white bg → compute tile bg → toggle.
 * Short-circuits when svg is null, falling back to tileBgHint if provided.
 */
export function useSmartBg(svg: string | null, tileBgHint?: "light" | "dark" | null): SmartBgResult {
  const strippedSvg = useMemo(() => (svg ? stripWhiteSvgBg(svg) : null), [svg]);
  const autoBg = useMemo(() => (strippedSvg ? tileBgForSvg(strippedSvg) : null), [strippedSvg]);
  const autoIsLight = autoBg ? isLightBg(autoBg) : tileBgHint === "light";

  const [bgMode, setBgMode] = useState<"auto" | "dark" | "light">("auto");

  const cycleBg = useCallback(() => {
    setBgMode((prev) => {
      if (prev === "auto") return autoIsLight ? "dark" : "light";
      if (prev === "light") return "dark";
      return "light";
    });
  }, [autoIsLight]);

  const defaultBg = tileBgHint === "light" ? LIGHT_BG : DARK_BG;
  const currentBg = bgMode === "auto" ? (autoBg ?? defaultBg) : bgMode === "dark" ? DARK_BG : LIGHT_BG;
  const currentIsLight = bgMode === "light" || (bgMode === "auto" && autoIsLight);
  const displaySvg = currentIsLight ? (svg ?? null) : (strippedSvg ?? svg ?? null);

  return {
    strippedSvg,
    bgColor: currentBg,
    isLight: currentIsLight,
    bgMode,
    cycleBg,
    displaySvg,
  };
}
