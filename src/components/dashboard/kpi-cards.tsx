"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KPICardsProps {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  marketShare: string;
  uniqueOrgs: number;
}

export function KPICards({
  selectedCA,
  totalCerts,
  caCerts,
  marketShare,
  uniqueOrgs,
}: KPICardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total BIMI Certs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalCerts.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">Across all CAs</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {selectedCA} Certs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{caCerts.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">Issued by {selectedCA}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Share</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{marketShare}%</div>
          <p className="text-xs text-muted-foreground">
            {selectedCA} vs market
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unique Orgs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {uniqueOrgs.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Organizations using {selectedCA}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
