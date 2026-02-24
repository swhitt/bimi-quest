"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { CASelector } from "./ca-selector";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/certificates", label: "Certificates" },
  { href: "/validate", label: "Validate" },
  { href: "/map", label: "Map" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link href="/" className="mr-6 flex items-center gap-2 font-semibold">
          <span className="text-lg">BIMI Intel</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 rounded-md transition-colors",
                pathname === item.href
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Your CA:</span>
          <Suspense>
            <CASelector />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
