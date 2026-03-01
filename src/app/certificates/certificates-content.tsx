import { CertificatesTable } from "@/components/tables/certificates-table";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";
import { getBaseUrl } from "@/lib/server-url";

export async function CertificatesContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const apiQuery = buildApiParamsFromSearchParams(searchParams);

  const baseUrl = await getBaseUrl();

  let data: { data: []; pagination: { page: number; limit: number; total: number; totalPages: number } };
  try {
    const res = await fetch(`${baseUrl}/api/certificates?${apiQuery}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load");
    data = await res.json();
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load certificates</p>
      </div>
    );
  }

  return <CertificatesTable data={data.data} pagination={data.pagination} />;
}
