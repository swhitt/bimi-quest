"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface KPICardsProps {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  activeCerts: number;
  marketShare: string;
  uniqueOrgs: number;
  newLast30d: number;
  caNewLast30d: number;
  expiringCount: number;
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isNegative = value < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isNegative
          ? "text-red-600 dark:text-red-400"
          : "text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {isNegative ? (
        <TrendingDown className="size-3" />
      ) : (
        <TrendingUp className="size-3" />
      )}
      {isNegative ? "" : "+"}
      {value.toLocaleString()} (30d)
    </span>
  );
}

export function KPICards({
  selectedCA,
  totalCerts,
  caCerts,
  activeCerts,
  marketShare,
  uniqueOrgs,
  newLast30d,
  caNewLast30d,
  expiringCount,
}: KPICardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active (Valid)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeCerts.toLocaleString()}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalCerts > 0
                ? `${((activeCerts / totalCerts) * 100).toFixed(0)}% of ${totalCerts.toLocaleString()} total`
                : "Currently valid certs"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{selectedCA} Certs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{caCerts.toLocaleString()}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Issued by {selectedCA}</p>
            <DeltaBadge value={caNewLast30d} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Share</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{marketShare}%</div>
          <p className="text-xs text-muted-foreground">{selectedCA} vs market</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unique Orgs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{uniqueOrgs.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">Organizations using {selectedCA}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${expiringCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {expiringCount.toLocaleString()}
            </span>
            {expiringCount > 0 && <AlertTriangle className="size-5 text-amber-500" />}
          </div>
          <p className="text-xs text-muted-foreground">Expiring within 30 days</p>
        </CardContent>
      </Card>
    </div>
  );
}
