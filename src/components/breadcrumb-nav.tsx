import type { ReactNode } from "react";
import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** Custom content to render instead of the label text (for the last crumb) */
  node?: ReactNode;
}

export function BreadcrumbNav({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="shrink-0">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground shrink-0">
              {item.label}
            </Link>
          ) : item.node ? (
            item.node
          ) : (
            <span className="text-foreground truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
