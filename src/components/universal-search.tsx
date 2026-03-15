"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { domainUrl, orgUrl } from "@/lib/entity-urls";
import { detectSearchType, extractDomain, normalizeHex, type SearchType } from "@/lib/search-detect";

interface Suggestion {
  label: string;
  type: "domain" | "org";
  count: number;
}

interface UniversalSearchProps {
  variant?: "hero" | "nav";
  autoFocus?: boolean;
  onNavigate?: () => void;
}

const TYPE_LABELS: Record<SearchType, string> = {
  domain: "domain",
  serial: "serial number",
  fingerprint: "fingerprint",
  text: "organization or domain",
};

export function UniversalSearch({ variant = "nav", autoFocus = false, onNavigate }: UniversalSearchProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const router = useRouter();

  const searchType = detectSearchType(value);
  const isHexSearch = searchType === "serial" || searchType === "fingerprint";

  const fetchSuggestions = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const type = detectSearchType(query);

    // For hex searches, check the certificates API directly
    if (type === "serial" || type === "fingerprint") {
      const hex = normalizeHex(query);
      if (hex.length < 8) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      try {
        const param = type === "fingerprint" ? "fingerprint" : "serial";
        const res = await fetch(`/api/certificates?${param}=${encodeURIComponent(hex)}&limit=5`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const certs = data.data || [];
        const mapped: Suggestion[] = certs.map(
          (c: { subjectOrg?: string; subjectCn?: string; fingerprintSha256: string; serialNumber: string }) => ({
            label: c.subjectOrg || c.subjectCn || c.fingerprintSha256.slice(0, 16),
            type: "domain" as const,
            count: 0,
            _fingerprint: c.fingerprintSha256,
            _serial: c.serialNumber,
          }),
        );
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
        setActiveIndex(-1);
      } catch {
        // Aborted or network error
      } finally {
        setLoading(false);
      }
      return;
    }

    // For text/domain queries, use the autocomplete API
    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!res.ok) return;
      const data: Suggestion[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
      setActiveIndex(-1);
    } catch {
      // Aborted or network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(value), 200);
    return () => clearTimeout(timerRef.current);
  }, [value, fetchSuggestions]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigate(input: string, type: "domain" | "org") {
    const trimmed = input.trim();
    if (!trimmed) return;

    const detected = detectSearchType(trimmed);

    if (detected === "fingerprint") {
      const hex = normalizeHex(trimmed);
      router.push(`/certificates/${hex}`);
    } else if (detected === "serial") {
      const hex = normalizeHex(trimmed);
      router.push(`/certificates?serial=${encodeURIComponent(hex)}`);
    } else if (type === "org") {
      router.push(orgUrl(input));
    } else {
      const domain = extractDomain(trimmed);
      if (domain) {
        router.push(domainUrl(domain));
      }
    }

    setValue("");
    setOpen(false);
    onNavigate?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate(value, "domain");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          const s = suggestions[activeIndex];
          if (isHexSearch) {
            // For cert results, navigate to the cert detail using the fingerprint
            const certSuggestion = s as Suggestion & { _fingerprint?: string };
            if (certSuggestion._fingerprint) {
              router.push(`/certificates/${certSuggestion._fingerprint}`);
              setValue("");
              setOpen(false);
              onNavigate?.();
              return;
            }
          }
          setValue(s.label);
          navigate(s.label, s.type);
        } else {
          navigate(value, "domain");
        }
        setOpen(false);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  function handleSelect(s: Suggestion) {
    if (isHexSearch) {
      const certSuggestion = s as Suggestion & { _fingerprint?: string };
      if (certSuggestion._fingerprint) {
        router.push(`/certificates/${certSuggestion._fingerprint}`);
        setValue("");
        setOpen(false);
        onNavigate?.();
        return;
      }
    }
    setValue(s.label);
    navigate(s.label, s.type);
    inputRef.current?.blur();
  }

  const isHero = variant === "hero";

  return (
    <div ref={containerRef} className="relative">
      <svg
        className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10 ${
          isHero ? "size-5" : "size-3.5 left-2"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <Input
        ref={inputRef}
        data-search-input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={isHero ? "Search domains, organizations, serial numbers, or fingerprints..." : "Search..."}
        className={
          isHero
            ? "h-12 text-base pl-10 bg-background border-border/60 shadow-sm focus-visible:ring-primary/30"
            : "h-8 w-36 md:w-44 text-xs bg-muted/50 border-transparent focus:border-border focus:w-52 md:focus:w-64 transition-all duration-200 pl-7"
        }
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
      />
      {value.trim().length > 0 && !open && !loading && (
        <div
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground ${isHero ? "" : "hidden"}`}
        >
          {TYPE_LABELS[searchType]} &crarr;
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className={`absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md overflow-hidden ${
            isHero ? "max-h-80" : ""
          }`}
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}-${i}`}
              id={`${baseId}-option-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors ${
                i === activeIndex ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {isHexSearch ? (
                <>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-8">
                    cert
                  </span>
                  <span className="truncate flex-1">
                    {(s as Suggestion & { _fingerprint?: string })._fingerprint
                      ? `${s.label} (${((s as Suggestion & { _fingerprint?: string })._fingerprint || "").slice(0, 12)}...)`
                      : s.label}
                  </span>
                </>
              ) : (
                <>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-8">
                    {s.type === "domain" ? "domain" : "org"}
                  </span>
                  <span className="truncate flex-1">{s.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{s.count}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
