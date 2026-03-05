import Link from "next/link";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/dashboard/sparkline";

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
  caNewLast30d: number;
  expiringCount: number;
  vmcTotal: number;
  cmcTotal: number;
  activeFilters?: ActiveFilters;
  lastUpdated?: string | null;
  dailyTrend: number[];
}

export function KPICards({
  selectedCA,
  totalCerts,
  caCerts,
  activeCerts,
  marketShare,
  uniqueOrgs,
  caNewLast30d,
  expiringCount,
  vmcTotal,
  cmcTotal,
  lastUpdated,
  dailyTrend,
}: KPICardsProps) {
  const vmcPct = vmcTotal + cmcTotal > 0 ? ((vmcTotal / (vmcTotal + cmcTotal)) * 100).toFixed(0) : "\u2014";
  const activePct = totalCerts > 0 ? ((activeCerts / totalCerts) * 100).toFixed(0) : "\u2014";

  return (
    <div className="space-y-1.5">
      {/* Row 1: Hero number + sparkline + primary context */}
      <div className="flex items-center gap-3 flex-wrap">
        <span data-testid="kpi-total-certs" className="text-3xl font-bold font-mono tabular-nums">
          {activeCerts.toLocaleString()}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm text-muted-foreground cursor-help">active</span>
          </TooltipTrigger>
          <TooltipContent>Currently valid (not expired) certificates</TooltipContent>
        </Tooltip>
        <Sparkline data={dailyTrend} width={60} height={16} className="text-emerald-500" />
        <span className="text-sm text-muted-foreground">
          {activePct}% of {totalCerts.toLocaleString()}
        </span>
        <span className="text-muted-foreground hidden sm:inline">&middot;</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm text-muted-foreground cursor-help hidden sm:inline">
              {selectedCA}{" "}
              <span className="font-mono tabular-nums font-medium text-foreground">{caCerts.toLocaleString()}</span>
              {caNewLast30d > 0 && <span className="text-emerald-600 dark:text-emerald-400 ml-1">+{caNewLast30d}</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Certificates from {selectedCA}
            {caNewLast30d > 0 ? ` (+${caNewLast30d} in last 30 days)` : ""}
          </TooltipContent>
        </Tooltip>
        {marketShare != null && (
          <>
            <span className="text-muted-foreground hidden sm:inline">&middot;</span>
            <span className="text-sm font-mono tabular-nums text-muted-foreground hidden sm:inline">
              {marketShare}% share
            </span>
          </>
        )}
      </div>

      {/* Row 2: Secondary metrics */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help font-mono tabular-nums">{uniqueOrgs.toLocaleString()} orgs</span>
          </TooltipTrigger>
          <TooltipContent>Unique organizations with certificates</TooltipContent>
        </Tooltip>
        <span className="text-muted-foreground">&middot;</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/certificates?validity=active&expiresFrom=today&expiresTo=+30d"
              className={`cursor-help font-mono tabular-nums hover:underline ${expiringCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
            >
              {expiringCount} expiring
            </Link>
          </TooltipTrigger>
          <TooltipContent>Certificates expiring within 30 days</TooltipContent>
        </Tooltip>
        <span className="text-muted-foreground">&middot;</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help font-mono tabular-nums">
              {vmcPct}% VMC
              <span className="text-xs ml-1">
                ({vmcTotal.toLocaleString()}/{cmcTotal.toLocaleString()})
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            VMC = Verified Mark Certificate (requires trademark). CMC = Common Mark Certificate.
          </TooltipContent>
        </Tooltip>
        {lastUpdated && (
          <>
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">
              updated <RelativeTime date={lastUpdated} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
