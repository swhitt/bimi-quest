import { DnsChangesTable } from "@/components/tables/dns-changes-table";
import { fetchDnsChanges } from "@/lib/data/dns-changes";

function toURLSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string" && val) params.set(key, val);
  }
  return params;
}

export async function DnsChangesContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filterParams = toURLSearchParams(searchParams);

  const page = filterParams.get("page") ?? undefined;
  const limit = filterParams.get("limit") ?? undefined;

  let result;
  try {
    result = await fetchDnsChanges(filterParams, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load DNS changes</p>
      </div>
    );
  }

  return <DnsChangesTable data={result.data} pagination={result.pagination} />;
}
