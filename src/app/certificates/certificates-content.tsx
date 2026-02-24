"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CertificatesTable } from "@/components/tables/certificates-table";
import { useGlobalFilters } from "@/lib/use-global-filters";

export function CertificatesContent() {
  const searchParams = useSearchParams();
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<{
    data: [];
    pagination: { page: 1; limit: 50; total: 0; totalPages: 0 };
  }>({
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);

  // Page-local params (search, sort, pagination)
  const page = searchParams.get("page") || "";
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "";
  const dir = searchParams.get("dir") || "";

  const apiQuery = buildApiParams({
    ...(page && { page }),
    ...(search && { search }),
    ...(sort && { sort }),
    ...(dir && { dir }),
  });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/certificates?${apiQuery}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiQuery]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading certificates...
      </div>
    );
  }

  return <CertificatesTable data={data.data} pagination={data.pagination} />;
}
