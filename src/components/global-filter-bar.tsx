"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, SlidersHorizontal } from "lucide-react";
import {
  ALL_CA_SLUGS,
  CA_DISPLAY_NAMES,
  CA_SLUG_TO_NAME,
  caNameToSlug,
} from "@/lib/ca-slugs";

const CERT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "VMC", label: "VMC" },
  { value: "CMC", label: "CMC" },
];

const VALIDITY_OPTIONS = [
  { value: "all", label: "Any Status" },
  { value: "valid", label: "Valid" },
  { value: "expired", label: "Expired" },
];

function FilterBarInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Don't show on validate page
  if (pathname === "/validate") return null;

  // Read CA from path segment /ca/slug
  const pathMatch = pathname.match(/^\/ca\/([^/]+)/);
  const caSlug = pathMatch ? pathMatch[1].toLowerCase() : "";
  const ca = caSlug ? (CA_SLUG_TO_NAME[caSlug] ?? "") : "";

  // Build a URL preserving secondary filters, with the CA in the path
  const buildUrl = useCallback(
    (newCaSlug: string, updates?: Record<string, string | null>) => {
      // Figure out the base page path (stripping /ca/xxx prefix)
      let pagePath = pathname;
      if (pathname.startsWith("/ca/")) {
        const segs = pathname.split("/").filter(Boolean);
        pagePath = "/" + segs.slice(2).join("/");
        if (pagePath === "/") pagePath = "/";
      }

      const base = newCaSlug
        ? `/ca/${newCaSlug}${pagePath === "/" ? "" : pagePath}`
        : pagePath;

      const params = new URLSearchParams(searchParams.toString());
      // CA is in the path, not in params
      params.delete("ca");
      params.delete("page");

      if (updates) {
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "" || value === "all") {
            params.delete(key);
          } else {
            params.set(key, value);
          }
        }
      }

      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    },
    [pathname, searchParams]
  );

  const updateSecondaryFilter = useCallback(
    (key: string, value: string) => {
      router.push(buildUrl(caSlug, { [key]: value }));
    },
    [router, buildUrl, caSlug]
  );

  const type = searchParams.get("type") ?? "all";
  const validity = searchParams.get("validity") ?? "all";
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";

  const hasFilters = ca || type !== "all" || validity !== "all" || dateFrom || dateTo;

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto flex items-center gap-2 px-4 py-2 overflow-x-auto">
        <SlidersHorizontal className="size-4 text-muted-foreground shrink-0" />

        <Select
          value={caSlug || "all"}
          onValueChange={(v) => router.push(buildUrl(v === "all" ? "" : v))}
        >
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="All CAs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CAs</SelectItem>
            {ALL_CA_SLUGS.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {CA_DISPLAY_NAMES[slug]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={type}
          onValueChange={(v) => updateSecondaryFilter("type", v)}
        >
          <SelectTrigger size="sm" className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CERT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={validity}
          onValueChange={(v) => updateSecondaryFilter("validity", v)}
        >
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALIDITY_OPTIONS.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => updateSecondaryFilter("from", e.target.value)}
            className="h-8 w-[130px] text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => updateSecondaryFilter("to", e.target.value)}
            className="h-8 w-[130px] text-xs"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              // Get the base page path
              let pagePath = pathname;
              if (pathname.startsWith("/ca/")) {
                const segs = pathname.split("/").filter(Boolean);
                pagePath = "/" + segs.slice(2).join("/");
                if (pagePath === "/") pagePath = "/";
              }
              router.push(pagePath);
            }}
            className="text-muted-foreground"
          >
            <X className="size-3" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function GlobalFilterBar() {
  return (
    <Suspense fallback={null}>
      <FilterBarInner />
    </Suspense>
  );
}
