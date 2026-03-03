"use client";

import { Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { LogoSvg } from "@/components/logo-svg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DARK_BG, isLightBg, LIGHT_BG, stripWhiteSvgBg, tileBgForSvg } from "@/lib/svg-bg";

interface LogoTabProps {
  svg: string | null;
}

export function LogoTab({ svg }: LogoTabProps) {
  const strippedSvg = useMemo(() => (svg ? stripWhiteSvgBg(svg) : null), [svg]);
  const autoBg = useMemo(() => (strippedSvg ? tileBgForSvg(strippedSvg) : DARK_BG), [strippedSvg]);
  const autoIsLight = isLightBg(autoBg);

  const [bgMode, setBgMode] = useState<"auto" | "dark" | "light">("auto");

  if (!svg) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No logo embedded in this certificate</p>;
  }

  const currentIsLight = bgMode === "light" || (bgMode === "auto" && autoIsLight);

  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative group">
        <div
          className={cn(
            "w-[200px] h-[200px] rounded-xl p-4 ring-1 transition-colors duration-200",
            "[&>div>svg]:h-full [&>div>svg]:w-full",
            currentIsLight ? "ring-black/10" : "ring-white/10",
          )}
          style={{
            backgroundColor: bgMode === "auto" ? autoBg : bgMode === "dark" ? DARK_BG : LIGHT_BG,
          }}
        >
          <LogoSvg
            svg={bgMode === "light" ? svg : (strippedSvg ?? svg)}
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
          />
        </div>
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => setBgMode(bgMode === "auto" ? "light" : bgMode === "light" ? "dark" : "auto")}
            title={`Background: ${bgMode} (click to cycle)`}
            className="backdrop-blur-sm bg-background/80 shadow-md"
          >
            {bgMode === "dark" || (bgMode === "auto" && !autoIsLight) ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
