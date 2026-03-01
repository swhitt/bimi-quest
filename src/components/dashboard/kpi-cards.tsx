"use client";

import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface KPICardsProps {
  selectedCA: string;
  totalCerts: number;
  caCerts: number;
  activeCerts: number;
  marketShare: number | null;
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
        isNegative ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {isNegative ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
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
  newLast30d: _newLast30d,
  caNewLast30d,
  expiringCount,
}: KPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 border rounded-lg sm:divide-x divide-y md:divide-y-0 bg-card">
      <div className="px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active (Valid)</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{activeCerts.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {totalCerts > 0
            ? `${((activeCerts / totalCerts) * 100).toFixed(0)}% of ${totalCerts.toLocaleString()} total`
            : "Currently valid certs"}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{selectedCA} Certs</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{caCerts.toLocaleString()}</div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground">Issued by {selectedCA}</span>
          <DeltaBadge value={caNewLast30d} />
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Share</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{marketShare != null ? `${marketShare}%` : "100%"}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{selectedCA} vs market</div>
      </div>

      <div className="px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unique Orgs</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{uniqueOrgs.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Organizations using {selectedCA}</div>
      </div>

      <div className="px-4 py-3 sm:col-span-2 md:col-span-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expiring Soon</div>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-2xl font-bold tabular-nums ${expiringCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {expiringCount.toLocaleString()}
          </span>
          {expiringCount > 0 && <AlertTriangle className="size-5 text-amber-500" />}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">Expiring within 30 days</div>
      </div>
    </div>
  );
}
