"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CertificatesTable } from "@/components/tables/certificates-table";

export function CertificatesContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<{ data: []; pagination: { page: 1; limit: 50; total: 0; totalPages: 0 } }>({
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    fetch(`/api/certificates?${params.toString()}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading certificates...
      </div>
    );
  }

  return <CertificatesTable data={data.data} pagination={data.pagination} />;
}
