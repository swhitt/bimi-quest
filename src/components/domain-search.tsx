"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Extract domain from input, handling email addresses like user@example.com */
function extractDomain(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    return trimmed.split("@").pop() || trimmed;
  }
  return trimmed;
}

export function DomainSearch() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const domain = extractDomain(value);
    if (!domain) return;
    router.push(`/validate?domain=${encodeURIComponent(domain)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 max-w-xl">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter a domain to check BIMI readiness..."
        className="h-11 text-base"
      />
      <Button type="submit" size="lg" disabled={!value.trim()}>
        Validate
      </Button>
    </form>
  );
}
