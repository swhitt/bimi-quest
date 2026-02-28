"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { ThemeToggle } from "./theme-toggle";
import { UniversalSearch } from "./universal-search";
import { caNameToSlug } from "@/lib/ca-slugs";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/certificates", label: "Certificates" },
  { href: "/logos", label: "Logos" },
  { href: "/validate", label: "Validate" },
  { href: "/map", label: "Map" },
];

// Secondary filter keys that travel as query params
const SECONDARY_FILTER_KEYS = ["type", "validity", "from", "to", "country", "precert", "root"];

function NavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The CA might come from the middleware rewrite (as ?ca=) or from the path
  const ca = searchParams.get("ca");
  const caSlug = ca ? caNameToSlug(ca) : undefined;

  function buildHref(href: string) {
    // Build the path: /{page}/ca/{slug} or just /{page}
    const caSuffix = caSlug ? `/ca/${caSlug}` : "";
    const base = href === "/" ? (caSuffix || "/") : `${href}${caSuffix}`;

    // Carry forward secondary filters
    const params = new URLSearchParams();
    for (const key of SECONDARY_FILTER_KEYS) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  // Determine which nav item is active based on actual pathname
  function isActive(href: string) {
    if (href === "/") return pathname === "/" || pathname === `/ca/${caSlug}`;
    return pathname.startsWith(href);
  }

  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={buildHref(item.href)}
          className={cn(
            "px-2 py-1 transition-colors",
            isActive(item.href)
              ? "border-b-2 border-primary text-foreground font-medium rounded-none"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Nav() {
  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex h-12 items-center px-4">
        <Link href="/" className="mr-6 flex items-center gap-2">
          <img src="/logo.svg" alt="" className="size-6" />
          <span className="text-base font-semibold">BIMI Quest</span>
        </Link>
        <Suspense
          fallback={
            <nav className="flex items-center gap-1 text-sm">
              {navItems.map((i) => (
                <span
                  key={i.href}
                  className="px-2 py-1 text-muted-foreground"
                >
                  {i.label}
                </span>
              ))}
            </nav>
          }
        >
          <NavLinks />
        </Suspense>

        <div className="ml-auto flex items-center gap-3">
          <UniversalSearch variant="nav" />
          <Suspense>
            <ThemeToggle />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
