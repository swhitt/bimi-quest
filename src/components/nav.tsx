"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { caNameToSlug } from "@/lib/ca-slugs";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { UniversalSearch } from "./universal-search";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/certificates", label: "Certificates" },
  { href: "/logos", label: "Logos" },
  { href: "/ct/gorgon", label: "Log" },
  { href: "/validate", label: "Validate" },
  { href: "/map", label: "Map" },
];

// Secondary filter keys that travel as query params
const SECONDARY_FILTER_KEYS = [
  "type",
  "mark",
  "validity",
  "precert",
  "root",
  "industry",
  "from",
  "to",
  "expiresFrom",
  "expiresTo",
  "country",
];

/**
 * Shared hook for nav link href building and active-state detection.
 * Both desktop NavLinks and MobileNavLinks use this to preserve
 * CA context and secondary filters across navigation.
 */
function useNavHelpers() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // CA can come from the path (/ca/{slug}) or middleware rewrite (?ca=Name)
  const pathCaMatch = pathname.match(/\/ca\/([^/]+)/);
  const caSlug = pathCaMatch
    ? pathCaMatch[1].toLowerCase()
    : searchParams.get("ca")
      ? caNameToSlug(searchParams.get("ca")!)
      : undefined;

  function buildHref(href: string) {
    // Build the path: /{page}/ca/{slug} or just /{page}
    const caSuffix = caSlug ? `/ca/${caSlug}` : "";
    const base = href === "/" ? caSuffix || "/" : `${href}${caSuffix}`;

    // Carry forward secondary filters
    const params = new URLSearchParams();
    for (const key of SECONDARY_FILTER_KEYS) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/" || pathname === `/ca/${caSlug}`;
    return pathname.startsWith(href);
  }

  return { buildHref, isActive };
}

function NavLinks() {
  const { buildHref, isActive } = useNavHelpers();

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
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const { buildHref, isActive } = useNavHelpers();

  return (
    <nav aria-label="Mobile navigation" className="flex flex-col">
      {navItems.map((item) => (
        <SheetClose key={item.href} asChild>
          <Link
            href={buildHref(item.href)}
            onClick={onNavigate}
            className={cn(
              "py-3 px-4 text-base transition-colors min-h-[44px] flex items-center",
              isActive(item.href)
                ? "text-foreground font-medium bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {item.label}
          </Link>
        </SheetClose>
      ))}
    </nav>
  );
}

export function Nav() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex h-12 items-center px-4">
        <Link href="/" className="mr-3 md:mr-6 flex items-center gap-2">
          <Image src="/logo.svg" alt="" width={24} height={24} unoptimized />
          <span className="text-base font-semibold">BIMI Quest</span>
        </Link>

        {/* Desktop nav links - hidden on mobile */}
        <div data-testid="main-nav" className="hidden md:flex">
          <NavLinks />
        </div>

        {/* Mobile hamburger menu */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <div className="flex flex-col h-full">
              {/* Logo header */}
              <div className="flex items-center gap-2 p-4 border-b">
                <Image src="/logo.svg" alt="" width={24} height={24} unoptimized />
                <span className="text-base font-semibold">BIMI Quest</span>
              </div>

              {/* Nav links */}
              <MobileNavLinks onNavigate={() => setSheetOpen(false)} />

              {/* Search */}
              <div className="px-4 py-3 border-t">
                <UniversalSearch variant="hero" />
              </div>

              {/* Theme toggle at the bottom */}
              <div className="mt-auto p-4 border-t">
                <ThemeToggle />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="ml-auto flex items-center gap-3">
          {/* Search hidden on mobile - available in hamburger sheet instead */}
          <div className="hidden md:block">
            <UniversalSearch variant="nav" />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
