"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/pagination-bar";

interface Logo {
  svgHash: string;
  svg: string | null;
  org: string | null;
  domain: string | null;
  certType: string | null;
  count: number;
}

interface GalleryResponse {
  logos: Logo[];
  total: number;
  page: number;
  limit: number;
}

export function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;

  const [data, setData] = useState<GalleryResponse>({
    logos: [],
    total: 0,
    page: initialPage,
    limit: 60,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback((page: number) => {
    setLoading(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    fetch(`/api/gallery?page=${page}&limit=60`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((result: GalleryResponse) => {
        setData(result);
        const url = page > 1 ? `/gallery?page=${page}` : "/gallery";
        router.replace(url, { scroll: false });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load gallery")
      )
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    fetchPage(initialPage);
  }, [fetchPage, initialPage]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => fetchPage(data.page)}
        >
          Retry
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div className="space-y-6">
      {!loading && data.logos.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No logos found.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {loading
          ? Array.from({ length: 18 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))
          : data.logos.map((logo) => {
              const searchTerm = logo.domain || logo.org;
              const content = (
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-col items-center gap-2 p-3">
                    {logo.svg ? (
                      <div
                        className="flex h-20 w-20 items-center justify-center rounded-lg border bg-white p-2 overflow-hidden [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-full [&>svg]:h-auto"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeSvg(logo.svg),
                        }}
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <p className="w-full truncate text-center text-sm font-medium">
                      {logo.org || "Unknown"}
                    </p>
                    <p className="w-full truncate text-center text-xs text-muted-foreground">
                      {logo.domain || "---"}
                    </p>
                    <div className="flex gap-1 flex-wrap justify-center">
                      {logo.certType && (
                        <Badge variant="outline" className="text-[10px]">
                          {logo.certType}
                        </Badge>
                      )}
                      <Badge variant="secondary">{logo.count} certs</Badge>
                    </div>
                  </CardContent>
                </Card>
              );

              return searchTerm ? (
                <Link
                  key={logo.svgHash}
                  href={`/certificates?search=${encodeURIComponent(searchTerm)}`}
                >
                  {content}
                </Link>
              ) : (
                <div key={logo.svgHash}>{content}</div>
              );
            })}
      </div>

      {!loading && totalPages > 1 && (
        <PaginationBar
          pagination={{
            page: data.page,
            limit: data.limit,
            total: data.total,
            totalPages,
          }}
          onPageChange={fetchPage}
          noun="logos"
        />
      )}
    </div>
  );
}
