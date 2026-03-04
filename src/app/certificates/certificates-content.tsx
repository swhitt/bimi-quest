import { CertificatesTable } from "@/components/tables/certificates-table";
import { fetchCertificates, type CertificatesResult } from "@/lib/data/certificates";

/**
 * Build a URLSearchParams from a record, for passing to shared data functions.
 * Only includes non-empty string values.
 */
function toURLSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === "string" && val) params.set(key, val);
  }
  return params;
}

/**
 * Serialize Date fields to ISO strings for the client component.
 * The CertRow type used by the client expects string dates, not Date objects.
 */
function serializeForClient(result: CertificatesResult) {
  return {
    data: result.data.map((row) => ({
      ...row,
      notBefore: row.notBefore instanceof Date ? row.notBefore.toISOString() : String(row.notBefore),
      notAfter: row.notAfter instanceof Date ? row.notAfter.toISOString() : String(row.notAfter),
      ctLogTimestamp: row.ctLogTimestamp instanceof Date ? row.ctLogTimestamp.toISOString() : row.ctLogTimestamp,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    })),
    pagination: result.pagination,
  };
}

export async function CertificatesContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filterParams = toURLSearchParams(searchParams);

  const page = filterParams.get("page") ?? undefined;
  const limit = filterParams.get("limit") ?? undefined;
  const sort = filterParams.get("sort") ?? undefined;
  const dir = filterParams.get("dir") ?? undefined;

  let result: CertificatesResult;
  try {
    result = await fetchCertificates(filterParams, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sort,
      dir,
    });
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load certificates</p>
      </div>
    );
  }

  const serialized = serializeForClient(result);

  return <CertificatesTable data={serialized.data} pagination={serialized.pagination} />;
}
