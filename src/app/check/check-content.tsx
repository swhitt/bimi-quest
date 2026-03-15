"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DomainAutocomplete } from "@/components/domain-autocomplete";
import { Button } from "@/components/ui/button";
import { extractDomain } from "@/lib/search-detect";

export function CheckContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlDomain = searchParams.get("q") || searchParams.get("domain") || "";
  const [domain, setDomain] = useState(urlDomain);

  function navigate(input: string) {
    const clean = extractDomain(input.trim());
    if (!clean) return;
    router.push(`/domains/${encodeURIComponent(clean)}?fresh=1`);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">BIMI Check</h1>
      <div className="flex flex-col sm:flex-row gap-3">
        <DomainAutocomplete
          value={domain}
          onChange={setDomain}
          onSelect={(val) => navigate(val)}
          placeholder="example.com or user@example.com"
          className="sm:max-w-md flex-1"
          autoFocus
        />
        <Button onClick={() => navigate(domain)} disabled={!domain.trim()}>
          Check
        </Button>
      </div>
    </div>
  );
}
