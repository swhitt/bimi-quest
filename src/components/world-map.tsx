"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

// ISO 3166-1 numeric -> alpha-2 mapping (covers all countries in world-110m.json)
const NUM_TO_ALPHA2: Record<string, string> = {
  "004": "AF",
  "008": "AL",
  "012": "DZ",
  "016": "AS",
  "020": "AD",
  "024": "AO",
  "028": "AG",
  "031": "AZ",
  "032": "AR",
  "036": "AU",
  "040": "AT",
  "044": "BS",
  "048": "BH",
  "050": "BD",
  "051": "AM",
  "056": "BE",
  "060": "BM",
  "064": "BT",
  "068": "BO",
  "070": "BA",
  "072": "BW",
  "076": "BR",
  "084": "BZ",
  "090": "SB",
  "092": "VG",
  "096": "BN",
  "100": "BG",
  "104": "MM",
  "108": "BI",
  "112": "BY",
  "116": "KH",
  "120": "CM",
  "124": "CA",
  "132": "CV",
  "140": "CF",
  "144": "LK",
  "148": "TD",
  "152": "CL",
  "156": "CN",
  "158": "TW",
  "170": "CO",
  "174": "KM",
  "178": "CG",
  "180": "CD",
  "188": "CR",
  "191": "HR",
  "192": "CU",
  "196": "CY",
  "203": "CZ",
  "204": "BJ",
  "208": "DK",
  "212": "DM",
  "214": "DO",
  "218": "EC",
  "222": "SV",
  "226": "GQ",
  "231": "ET",
  "232": "ER",
  "233": "EE",
  "234": "FO",
  "242": "FJ",
  "246": "FI",
  "250": "FR",
  "254": "GF",
  "258": "PF",
  "262": "DJ",
  "266": "GA",
  "268": "GE",
  "270": "GM",
  "275": "PS",
  "276": "DE",
  "288": "GH",
  "296": "KI",
  "300": "GR",
  "304": "GL",
  "308": "GD",
  "312": "GP",
  "316": "GU",
  "320": "GT",
  "324": "GN",
  "328": "GY",
  "332": "HT",
  "340": "HN",
  "344": "HK",
  "348": "HU",
  "352": "IS",
  "356": "IN",
  "360": "ID",
  "364": "IR",
  "368": "IQ",
  "372": "IE",
  "376": "IL",
  "380": "IT",
  "384": "CI",
  "388": "JM",
  "392": "JP",
  "398": "KZ",
  "400": "JO",
  "404": "KE",
  "408": "KP",
  "410": "KR",
  "414": "KW",
  "417": "KG",
  "418": "LA",
  "422": "LB",
  "426": "LS",
  "428": "LV",
  "430": "LR",
  "434": "LY",
  "438": "LI",
  "440": "LT",
  "442": "LU",
  "450": "MG",
  "454": "MW",
  "458": "MY",
  "462": "MV",
  "466": "ML",
  "470": "MT",
  "478": "MR",
  "480": "MU",
  "484": "MX",
  "492": "MC",
  "496": "MN",
  "498": "MD",
  "499": "ME",
  "504": "MA",
  "508": "MZ",
  "512": "OM",
  "516": "NA",
  "520": "NR",
  "524": "NP",
  "528": "NL",
  "540": "NC",
  "548": "VU",
  "554": "NZ",
  "558": "NI",
  "562": "NE",
  "566": "NG",
  "578": "NO",
  "583": "FM",
  "586": "PK",
  "591": "PA",
  "598": "PG",
  "600": "PY",
  "604": "PE",
  "608": "PH",
  "616": "PL",
  "620": "PT",
  "624": "GW",
  "626": "TL",
  "630": "PR",
  "634": "QA",
  "642": "RO",
  "643": "RU",
  "646": "RW",
  "659": "KN",
  "662": "LC",
  "670": "VC",
  "678": "ST",
  "682": "SA",
  "686": "SN",
  "688": "RS",
  "694": "SL",
  "702": "SG",
  "703": "SK",
  "704": "VN",
  "705": "SI",
  "706": "SO",
  "710": "ZA",
  "716": "ZW",
  "724": "ES",
  "728": "SS",
  "729": "SD",
  "740": "SR",
  "748": "SZ",
  "752": "SE",
  "756": "CH",
  "760": "SY",
  "762": "TJ",
  "764": "TH",
  "768": "TG",
  "776": "TO",
  "780": "TT",
  "784": "AE",
  "788": "TN",
  "792": "TR",
  "795": "TM",
  "798": "TV",
  "800": "UG",
  "804": "UA",
  "807": "MK",
  "818": "EG",
  "826": "GB",
  "831": "GG",
  "832": "JE",
  "833": "IM",
  "834": "TZ",
  "840": "US",
  "854": "BF",
  "858": "UY",
  "860": "UZ",
  "862": "VE",
  "887": "YE",
  "894": "ZM",
  "-99": "XK",
};

// Module-level singleton so the formatter is created once across renders
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function getCountryName(alpha2: string): string {
  try {
    return countryNames.of(alpha2) ?? alpha2;
  } catch {
    return alpha2;
  }
}

interface CountryData {
  country: string;
  total: number;
  vmcCount?: number;
  cmcCount?: number;
}

interface WorldMapProps {
  data: CountryData[];
  className?: string;
  onCountryClick?: (alpha2: string) => void;
}

let topoCache: Topology | null = null;

export function WorldMap({ data, className, onCountryClick }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [topology, setTopology] = useState<Topology | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; detail?: string } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  useEffect(() => {
    if (topoCache) {
      setTopology(topoCache);
      return;
    }
    fetch("/world-110m.json")
      .then((res) => res.json())
      .then((topo: Topology) => {
        topoCache = topo;
        setTopology(topo);
      })
      .catch(console.error);
  }, []);

  const dataMap = useMemo(() => {
    const map = new Map<string, CountryData>();
    for (const d of data) {
      if (d.country) map.set(d.country, d);
    }
    return map;
  }, [data]);

  const maxVal = useMemo(() => {
    let max = 0;
    for (const d of data) if (d.total > max) max = d.total;
    return max;
  }, [data]);

  // Memoize the heavy geo computations so they don't run on every mouse-move
  const { countriesGeo, pathGen } = useMemo(() => {
    if (!topology) return { countriesGeo: null, pathGen: null };
    const geo = feature(topology, topology.objects.countries as GeometryCollection);
    const proj = geoNaturalEarth1().fitSize([960, 500], geo as GeoPermissibleObjects);
    return { countriesGeo: geo, pathGen: geoPath(proj) };
  }, [topology]);

  // Legend tick values on a log scale (1, 10, 100, max)
  const legendTicks = useMemo(() => {
    if (maxVal === 0) return [];
    const ticks: number[] = [1];
    for (let v = 10; v < maxVal; v *= 10) ticks.push(v);
    ticks.push(maxVal);
    return [...new Set(ticks)];
  }, [maxVal]);

  if (!topology || !countriesGeo || !pathGen) {
    return (
      <div className={`flex h-64 items-center justify-center text-muted-foreground ${className || ""}`}>
        Loading map...
      </div>
    );
  }

  // Color scale: muted (0) -> light blue -> deep blue (log scale for better distribution)
  function getColor(alpha2: string | undefined): string {
    if (!alpha2) return "var(--muted)";
    const entry = dataMap.get(alpha2);
    if (!entry || entry.total === 0) return "var(--muted)";
    const t = Math.log1p(entry.total) / Math.log1p(maxVal);
    const lightness = 0.85 - t * 0.45;
    const chroma = 0.05 + t * 0.15;
    return `oklch(${lightness} ${chroma} 250)`;
  }

  function buildTooltipContent(alpha2: string): { text: string; detail?: string } {
    const entry = dataMap.get(alpha2);
    const name = getCountryName(alpha2);
    const total = entry?.total ?? 0;
    const text = `${name}: ${total.toLocaleString()} certificate${total !== 1 ? "s" : ""}`;
    let detail: string | undefined;
    if (entry && entry.vmcCount !== undefined && entry.cmcCount !== undefined) {
      detail = `${entry.vmcCount.toLocaleString()} VMC / ${entry.cmcCount.toLocaleString()} CMC`;
    }
    return { text, detail };
  }

  function handleMouseMove(e: React.MouseEvent, alpha2: string | undefined) {
    if (!alpha2 || selectedCountry) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { text, detail } = buildTooltipContent(alpha2);
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      text,
      detail,
    });
  }

  function handleCountryClick(e: React.MouseEvent, alpha2: string | undefined) {
    if (!alpha2) return;
    e.stopPropagation();
    if (selectedCountry === alpha2) {
      setSelectedCountry(null);
      setTooltip(null);
      return;
    }
    setSelectedCountry(alpha2);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { text, detail } = buildTooltipContent(alpha2);
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      text,
      detail,
    });
    onCountryClick?.(alpha2);
  }

  return (
    <div
      className={`relative ${className || ""}`}
      role="img"
      aria-label="Choropleth world map showing BIMI certificate distribution by country"
    >
      <svg
        ref={svgRef}
        viewBox="0 0 960 500"
        className="w-full h-auto"
        onMouseLeave={() => {
          if (!selectedCountry) setTooltip(null);
        }}
        onClick={() => {
          setSelectedCountry(null);
          setTooltip(null);
        }}
      >
        {countriesGeo.features.map((feat, i) => {
          const numId = feat.id?.toString() || "";
          const alpha2 = NUM_TO_ALPHA2[numId];
          const d = pathGen(feat as GeoPermissibleObjects);
          if (!d) return null;
          const isSelected = selectedCountry === alpha2;
          return (
            <path
              key={numId || `geo-${i}`}
              d={d}
              fill={getColor(alpha2)}
              stroke={isSelected ? "var(--primary)" : "var(--border)"}
              strokeWidth={isSelected ? 1.5 : 0.5}
              className="transition-colors hover:brightness-110 cursor-default"
              onMouseMove={(e) => handleMouseMove(e, alpha2)}
              onMouseLeave={() => {
                if (!selectedCountry) setTooltip(null);
              }}
              onClick={(e) => handleCountryClick(e, alpha2)}
            />
          );
        })}
      </svg>

      {/* Color legend */}
      {maxVal > 0 && (
        <div className="mt-2 px-2">
          <p className="text-xs text-muted-foreground mb-1">Certificate count</p>
          <div className="flex items-center gap-2">
            <div
              className="h-3 flex-1 rounded"
              style={{
                background:
                  "linear-gradient(to right, oklch(0.85 0.05 250), oklch(0.7 0.1 250), oklch(0.55 0.15 250), oklch(0.4 0.2 250))",
              }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            {legendTicks.map((tick) => (
              <span key={tick} className="text-xs text-muted-foreground">
                {tick.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <div>{tooltip.text}</div>
          {tooltip.detail && <div className="text-muted-foreground">{tooltip.detail}</div>}
        </div>
      )}
    </div>
  );
}
