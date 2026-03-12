"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { certUrl, domainUrl, orgUrl } from "@/lib/entity-urls";
import { cn } from "@/lib/utils";

interface DomainResult {
  domain: string;
  grade: string | null;
}

interface CertResult {
  fingerprint: string;
  subjectOrg: string | null;
  subjectCn: string | null;
  certType: string | null;
  serialNumber: string;
}

interface OrgResult {
  org: string;
  count: number;
}

interface SearchResults {
  domains: DomainResult[];
  certificates: CertResult[];
  orgs: OrgResult[];
}

interface FlatItem {
  category: "Domains" | "Certificates" | "Organizations";
  label: string;
  detail: string;
  href: string;
}

function flattenResults(results: SearchResults): FlatItem[] {
  const items: FlatItem[] = [];

  for (const d of results.domains) {
    items.push({
      category: "Domains",
      label: d.domain,
      detail: d.grade ? `Grade ${d.grade}` : "No grade",
      href: domainUrl(d.domain),
    });
  }

  for (const c of results.certificates) {
    const name = c.subjectOrg || c.subjectCn || "Unknown";
    const typeLabel = c.certType ? ` ${c.certType}` : "";
    items.push({
      category: "Certificates",
      label: `${name}${typeLabel}`,
      detail: c.fingerprint.slice(0, 16) + "...",
      href: certUrl(c.fingerprint),
    });
  }

  for (const o of results.orgs) {
    items.push({
      category: "Organizations",
      label: o.org,
      detail: `${o.count} cert${o.count === 1 ? "" : "s"}`,
      href: orgUrl(o.org),
    });
  }

  return items;
}

const EMPTY: SearchResults = { domains: [], certificates: [], orgs: [] };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const items = flattenResults(results);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(EMPTY);
      setActiveIndex(0);
      // Focus the input after the dialog animation settles
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  const fetchResults = useCallback(async (q: string) => {
    abortRef.current?.abort();

    if (q.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data: SearchResults = await res.json();
      setResults(data);
      setActiveIndex(0);
    } catch {
      // Aborted or network error - ignore
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchResults(query), 150);
    return () => clearTimeout(timerRef.current);
  }, [query, fetchResults]);

  // Scroll the active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[activeIndex]) {
          navigate(items[activeIndex].href);
        }
        break;
      case "Escape":
        // Dialog handles Escape natively, but just in case
        setOpen(false);
        break;
    }
  }

  // Determine which categories appear and at which indices, for rendering headers
  const categoryHeaders: { category: string; index: number }[] = [];
  let lastCategory = "";
  for (let i = 0; i < items.length; i++) {
    if (items[i].category !== lastCategory) {
      categoryHeaders.push({ category: items[i].category, index: i });
      lastCategory = items[i].category;
    }
  }

  const hasQuery = query.trim().length >= 2;
  const noResults = hasQuery && !loading && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 w-full max-w-lg p-0 gap-0 shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        {/* Search input */}
        <div className="flex items-center border-b px-3">
          <svg
            className="mr-2 size-4 shrink-0 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search domains, certificates, organizations..."
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <div className="ml-2 size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          )}
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-72 overflow-y-auto">
          {noResults && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results found.</div>}

          {items.length > 0 && (
            <div className="py-1">
              {items.map((item, i) => {
                const showHeader = categoryHeaders.some((h) => h.index === i);
                return (
                  <div key={`${item.category}-${item.href}`}>
                    {showHeader && (
                      <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{item.category}</div>
                    )}
                    <button
                      type="button"
                      data-index={i}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-sm text-left cursor-pointer transition-colors",
                        i === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50",
                      )}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <CategoryIcon category={item.category} />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{item.detail}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!hasQuery && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Start typing to search...</div>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">&uarr;&darr;</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">&crarr;</kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd>
            Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tiny inline icon per result category. */
function CategoryIcon({ category }: { category: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  switch (category) {
    case "Domains":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10" />
        </svg>
      );
    case "Certificates":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10M7 12h6" />
        </svg>
      );
    case "Organizations":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Small keyboard shortcut hint for the nav bar.
 * Renders a subtle badge that opens the command palette on click.
 */
export function CommandPaletteHint() {
  return (
    <button
      type="button"
      onClick={() => {
        // Dispatch a synthetic Cmd+K to trigger the palette
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            bubbles: true,
          }),
        );
      }}
      className="hidden md:flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      aria-label="Open command palette"
    >
      <kbd className="font-mono text-[10px]">&#x2318;K</kbd>
    </button>
  );
}
