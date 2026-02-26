"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HostnameAutocomplete } from "./hostname-autocomplete";

function extractDomain(input: string): string {
  let cleaned = input.trim();
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@").pop() || cleaned;
  }
  cleaned = cleaned.replace(/^https?:\/\//, "").split("/")[0];
  return cleaned.toLowerCase();
}

export function DomainSearch() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSelect(input: string, type: "domain" | "org") {
    const domain = extractDomain(input);
    if (!domain) return;

    setLoading(true);
    try {
      if (type === "org") {
        router.push(`/certificates?search=${encodeURIComponent(input)}`);
      } else {
        const res = await fetch(`/api/resolve?domain=${encodeURIComponent(domain)}`);
        const data = await res.json();
        router.push(data.url);
      }
      setValue("");
    } catch {
      router.push(`/validate?domain=${encodeURIComponent(domain)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none z-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <HostnameAutocomplete
        value={value}
        onChange={setValue}
        onSelect={handleSelect}
        placeholder="Lookup hostname..."
        inputClassName="h-8 w-44 text-xs bg-muted/50 border-transparent focus:border-border focus:w-64 transition-all duration-200 pl-7"
        disabled={loading}
      />
    </div>
  );
}
