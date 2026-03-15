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

  const pageStr = filterParams.get("page");
  const limitStr = filterParams.get("limit");
  const page = pageStr ? (Number.isFinite(Number(pageStr)) ? Number(pageStr) : undefined) : undefined;
  const limit = limitStr ? (Number.isFinite(Number(limitStr)) ? Number(limitStr) : undefined) : undefined;

  let result;
  try {
    result = await fetchDnsChanges(filterParams, { page, limit });
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load DNS changes</p>
        <a href="/dns-changes" className="text-xs underline text-muted-foreground hover:text-foreground">
          Retry
        </a>
      </div>
    );
  }

  return <DnsChangesTable data={result.data} pagination={result.pagination} />;
}
