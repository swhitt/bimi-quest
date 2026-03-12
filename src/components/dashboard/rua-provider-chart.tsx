"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";

interface RuaProviderRow {
  provider: string;
  domainCount: number;
}

/** Map RUA report destination domains to their product/company name */
const PROVIDER_NAMES: Record<string, string> = {
  "vali.email": "Valimail",
  "emaildefense.proofpoint.com": "Proofpoint",
  "dmarc-reports.cloudflare.net": "Cloudflare",
  "inbox.ondmarc.com": "Red Sift OnDMARC",
  "rep.dmarcanalyzer.com": "DMARC Analyzer (Mimecast)",
  "ag.eu.dmarcadvisor.com": "DMARC Advisor",
  "dmarc.everest.email": "Everest (Validity)",
  "rua.powerdmarc.com": "PowerDMARC",
  "rua.easydmarc.us": "EasyDMARC",
  "rua.easydmarc.eu": "EasyDMARC",
  "rua.agari.com": "Agari (Fortra)",
  "mxtoolbox.dmarc-report.com": "MXToolbox",
  "dmarc.postmarkapp.com": "Postmark (ActiveCampaign)",
  "inbound.dmarcdigests.com": "DMARC Digests",
  "ag.dmarcian.com": "dmarcian",
  "ag.us.dmarcian.com": "dmarcian",
  "ag.eu.dmarcian.com": "dmarcian",
  "ag.dmarcly.com": "DMARCLY",
  "dmarc25.jp": "DMARC25",
  "progist.in": "Progist",
  "dmarc.inboxmonster.com": "Inbox Monster",
  "rua.dmarc.emailanalyst.com": "Email Analyst",
  "sdmarc.net": "sDMARC",
  "ar.glockapps.com": "GlockApps",
  "dmarc.250ok.net": "250ok (Validity)",
  "in.mailhardener.com": "Mailhardener",
  "rx.rakuten.co.jp": "Rakuten",
  "dmarc.brevo.com": "Brevo (Sendinblue)",
  "inbox.eu.redsift.cloud": "Red Sift",
  "rua.netcraft.com": "Netcraft",
  "rua.dmp.cisco.com": "Cisco Domain Protection",
  "dmarc-report.uriports.com": "URIports",
  "dmarc.fraudmarc.com": "Fraudmarc",
};

interface RuaTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function RuaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly RuaTooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const count = payload[0]?.value ?? 0;
  const domain = String(label ?? "");
  const company = PROVIDER_NAMES[domain];

  return (
    <ChartTooltipContent
      label={company ? `${company} (${domain})` : domain}
      rows={[{ color: payload[0]?.color ?? "oklch(0.55 0.15 230)", name: "Domains", value: count.toLocaleString() }]}
    />
  );
}

export function RuaProviderChart() {
  const router = useRouter();
  const [data, setData] = useState<RuaProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/rua-providers")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { data?: RuaProviderRow[] }) => {
        if (!cancelled) setData(json.data ?? []);
      })
      .catch(() => {
        /* keep empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && data.length === 0) {
    return (
      <div>
        <div className="mb-1">
          <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
            dmarc report destinations
          </span>
          <p className="text-[10px] text-muted-foreground">Top aggregate report (rua) providers by domain count</p>
        </div>
        <Skeleton className="h-[200px] mt-1" />
      </div>
    );
  }

  const chartData = data.slice(0, 25).map((d) => ({
    name: d.provider,
    domainCount: d.domainCount,
  }));

  const barHeight = Math.max(chartData.length * 24, 120);

  return (
    <div>
      <div className="mb-1">
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          dmarc report destinations
        </span>
        <p className="text-[10px] text-muted-foreground">Top aggregate report (rua) providers by domain count</p>
      </div>
      {chartData.length > 0 ? (
        <div role="img" aria-label="Horizontal bar chart showing top DMARC RUA report destination providers">
          <ResponsiveContainer width="100%" height={barHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} className="stroke-border" />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--color-foreground)", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={200}
                interval={0}
              />
              <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<RuaTooltip />} />
              <Bar
                dataKey="domainCount"
                name="Domains"
                fill="oklch(0.55 0.15 230)"
                fillOpacity={0.85}
                radius={[0, 3, 3, 0]}
                style={{ cursor: "pointer" }}
                onClick={(d) => {
                  if (d?.name) router.push(`/domains?f=dmarc.rua:contains:${encodeURIComponent(String(d.name))}`);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">
          No RUA data available.
        </div>
      )}
    </div>
  );
}
