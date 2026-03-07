import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReceiverTrustEntry {
  receiverDomain: string;
  dnsName: string;
  found: boolean;
  txtValue: string | null;
}

interface ReceiverTrustResultsProps {
  entries: ReceiverTrustEntry[];
}

export function ReceiverTrustResults({ entries }: ReceiverTrustResultsProps) {
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Receiver Trust Keys</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4 font-medium">Receiver</th>
                <th className="pb-2 pr-4 font-medium">DNS Name</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.receiverDomain} className="border-b last:border-0">
                  <td className="py-2 pr-4">{entry.receiverDomain}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{entry.dnsName}</td>
                  <td className="py-2 pr-4">
                    {entry.found ? (
                      <span className="text-emerald-600 dark:text-emerald-400">{"\u2713"} Found</span>
                    ) : (
                      <span className="text-muted-foreground">{"\u2717"} Not found</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs break-all">
                    {entry.txtValue
                      ? entry.txtValue.slice(0, 80) + (entry.txtValue.length > 80 ? "..." : "")
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
