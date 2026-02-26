"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

function extractDomain(input: string): string {
  let cleaned = input.trim();
  // Handle email addresses
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@").pop() || cleaned;
  }
  // Strip protocol and path
  cleaned = cleaned.replace(/^https?:\/\//, "").split("/")[0];
  return cleaned.toLowerCase();
}

export function DomainSearch() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const domain = extractDomain(value);
    if (!domain) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/resolve?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      router.push(data.url);
      setValue("");
    } catch {
      router.push(`/validate?domain=${encodeURIComponent(domain)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Lookup hostname..."
        className="h-8 w-44 text-xs bg-muted/50 border-transparent focus:border-border focus:w-64 transition-all duration-200 pl-7"
        disabled={loading}
      />
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    </form>
  );
}
