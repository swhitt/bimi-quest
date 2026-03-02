"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface ActiveFilters {
  type: string | null;
  mark: string | null;
  industry: string | null;
  country: string | null;
}

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
  vmcTotal: number;
  cmcTotal: number;
  activeFilters?: ActiveFilters;
  lastUpdated?: string | null;
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isNegative = value < 0;
  return (
    <span
      className={`text-xs font-medium ${
        isNegative ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {isNegative ? "" : "+"}
      {value.toLocaleString()} / 30d
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
  vmcTotal,
  cmcTotal,
  activeFilters,
  lastUpdated,
}: KPICardsProps) {
  const vmcPct = vmcTotal + cmcTotal > 0 ? ((vmcTotal / (vmcTotal + cmcTotal)) * 100).toFixed(0) : "—";

  const typeFilter = activeFilters?.type;
  const certNoun = typeFilter ? `${typeFilter}s` : "certs";
  const totalLabel = typeFilter ? `${totalCerts.toLocaleString()} ${certNoun}` : `${totalCerts.toLocaleString()} total`;

  return (
    <div className="space-y-1">
      {/* Hero metric */}
      <div>
        <p className="text-xs text-muted-foreground">{typeFilter ? `Active ${typeFilter}s` : "Active Certificates"}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums">{activeCerts.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">
            {totalCerts > 0
              ? `${((activeCerts / totalCerts) * 100).toFixed(0)}% of ${totalLabel}`
              : `Currently valid ${certNoun}`}
          </span>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground/60">
            Updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
          </p>
        )}
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-2 pt-1">
        <div>
          <p className="text-xs text-muted-foreground">{selectedCA}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold tabular-nums">{caCerts.toLocaleString()}</span>
            <DeltaBadge value={caNewLast30d} />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Market Share</p>
          <span className="text-lg font-bold tabular-nums">{marketShare != null ? `${marketShare}%` : "100%"}</span>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Unique Orgs</p>
          <span className="text-lg font-bold tabular-nums">{uniqueOrgs.toLocaleString()}</span>
        </div>

        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground underline decoration-dotted cursor-help w-fit">
                Expiring Soon
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              Certificates expiring within the next 30 days.
            </TooltipContent>
          </Tooltip>
          <Link
            href="/certificates?validity=active&expiresFrom=today&expiresTo=+30d"
            className={`text-lg font-bold tabular-nums hover:underline ${expiringCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {expiringCount.toLocaleString()}
          </Link>
        </div>

        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground underline decoration-dotted cursor-help w-fit">VMC / CMC</p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72">
              VMC = Verified Mark Certificate (requires registered trademark). CMC = Common Mark Certificate (no
              trademark required).
            </TooltipContent>
          </Tooltip>
          <span className="text-lg font-bold tabular-nums">{vmcPct}% VMC</span>
          <span className="text-xs text-muted-foreground ml-1.5">
            {vmcTotal.toLocaleString()} · {cmcTotal.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
