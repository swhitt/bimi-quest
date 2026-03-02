"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const WorldMap = dynamic(() => import("@/components/world-map").then((mod) => ({ default: mod.WorldMap })), {
  ssr: false,
  loading: () => <div className="flex h-[400px] items-center justify-center text-muted-foreground">Loading map...</div>,
});

interface WorldMapWrapperProps {
  data: { country: string; total: number; vmcCount?: number; cmcCount?: number }[];
}

export function WorldMapWrapper({ data }: WorldMapWrapperProps) {
  const router = useRouter();

  function handleCountryClick(alpha2: string) {
    router.push(`/certificates?country=${alpha2}`);
  }

  return <WorldMap data={data} onCountryClick={handleCountryClick} />;
}
