"use client";

import { LogoCard } from "@/components/logo-card";

interface LogoTabProps {
  svg: string | null;
  fingerprint?: string;
}

export function LogoTab({ svg, fingerprint }: LogoTabProps) {
  if (!svg) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No logo embedded in this certificate</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <LogoCard svg={svg} size="md" fingerprint={fingerprint} showShare asLink={false} />
    </div>
  );
}
