import { getBaseUrl } from "@/lib/server-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorldMapWrapper } from "@/components/map/world-map-wrapper";
import { buildApiParamsFromSearchParams } from "@/lib/global-filter-params";

interface GeoEntry {
  country: string | null;
  total: number;
  vmcCount: number;
  cmcCount: number;
}

export async function MapContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const apiQuery = buildApiParamsFromSearchParams(searchParams);

  const baseUrl = await getBaseUrl();

  let data: GeoEntry[];
  try {
    const res = await fetch(`${baseUrl}/api/stats/geo?${apiQuery}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load");
    const json = await res.json();
    data = json.geoData || [];
  } catch {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-destructive">Failed to load geographic data</p>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.total, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Global BIMI Certificate Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <WorldMapWrapper
            data={data.map((d) => ({ country: d.country || "", total: d.total }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Certificates by Country ({total.toLocaleString()} total)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">VMC</TableHead>
                <TableHead className="text-right">CMC</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.country || "unknown"}>
                  <TableCell className="font-medium">
                    {entry.country || "Unknown"}
                  </TableCell>
                  <TableCell className="text-right">{entry.total}</TableCell>
                  <TableCell className="text-right">{entry.vmcCount}</TableCell>
                  <TableCell className="text-right">{entry.cmcCount}</TableCell>
                  <TableCell className="text-right">
                    {total > 0 ? ((entry.total / total) * 100).toFixed(1) : 0}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
