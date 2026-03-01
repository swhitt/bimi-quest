"use client";

import dynamic from "next/dynamic";

const WorldMap = dynamic(() => import("@/components/world-map").then((mod) => ({ default: mod.WorldMap })), {
  ssr: false,
  loading: () => <div className="flex h-[400px] items-center justify-center text-muted-foreground">Loading map...</div>,
});

interface WorldMapWrapperProps {
  data: { country: string; total: number }[];
}

export function WorldMapWrapper({ data }: WorldMapWrapperProps) {
  return <WorldMap data={data} />;
}
