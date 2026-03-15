"use client";

import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/date-range-filter";
import {
  CountrySelect,
  IndustrySelect,
  PrecertSelect,
  RootCASelect,
  ValiditySelect,
} from "@/components/filter-selects";

export function FilterPanel({
  open,
  rootCa,
  validity,
  precert,
  industry,
  industryOptions,
  country,
  dateFrom,
  dateTo,
  ctFrom,
  ctTo,
  expiresFrom,
  expiresTo,
  onFilterChange,
  onMultiUpdate,
}: {
  open: boolean;
  rootCa: string;
  validity: string;
  precert: string;
  industry: string;
  industryOptions: { value: string; label: string }[];
  country: string;
  dateFrom: string;
  dateTo: string;
  ctFrom: string;
  ctTo: string;
  expiresFrom: string;
  expiresTo: string;
  onFilterChange: (key: string, value: string) => void;
  onMultiUpdate: (updates: Record<string, string | null>) => void;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="overflow-hidden">
        <div className="border-t border-border bg-muted/20 py-3 px-4">
          <div className="grid grid-cols-3 gap-x-6">
            {/* Column 1: Certificate */}
            <div className="flex flex-col gap-3">
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Root CA
                </span>
                <RootCASelect value={rootCa} onChange={(v) => onFilterChange("root", v)} className="w-full" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Validity
                </span>
                <ValiditySelect value={validity} onChange={(v) => onFilterChange("validity", v)} className="w-full" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Precert
                </span>
                <PrecertSelect value={precert} onChange={(v) => onFilterChange("precert", v)} className="w-full" />
              </div>
            </div>

            {/* Column 2: Timing */}
            <div className="flex flex-col gap-3">
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Issued Date
                </span>
                <DateRangeFilter
                  direction="past"
                  currentFrom={dateFrom}
                  currentTo={dateTo}
                  fromKey="from"
                  toKey="to"
                  fromLabel="Issued from date"
                  toLabel="Issued to date"
                  onCommit={(key, value) => {
                    if (key === "from" && !value) {
                      onMultiUpdate({ from: "all" });
                    } else {
                      onFilterChange(key, value);
                    }
                  }}
                  onMultiUpdate={(updates) => {
                    if ("from" in updates && !updates.from) {
                      onMultiUpdate({ ...updates, from: "all" });
                    } else {
                      onMultiUpdate(updates);
                    }
                  }}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  CT Log Date
                </span>
                <DateRangeFilter
                  direction="past"
                  currentFrom={ctFrom}
                  currentTo={ctTo}
                  fromKey="ctFrom"
                  toKey="ctTo"
                  fromLabel="CT log from date"
                  toLabel="CT log to date"
                  onCommit={onFilterChange}
                  onMultiUpdate={onMultiUpdate}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Expiry Date
                </span>
                <DateRangeFilter
                  direction="future"
                  currentFrom={expiresFrom}
                  currentTo={expiresTo}
                  fromKey="expiresFrom"
                  toKey="expiresTo"
                  fromLabel="Expires from date"
                  toLabel="Expires to date"
                  onCommit={onFilterChange}
                  onMultiUpdate={onMultiUpdate}
                />
              </div>
            </div>

            {/* Column 3: Context */}
            <div className="flex flex-col gap-3">
              {industryOptions.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                    Industry
                  </span>
                  <IndustrySelect
                    value={industry}
                    onChange={(v) => onFilterChange("industry", v)}
                    options={industryOptions}
                    className="w-full"
                  />
                </div>
              )}
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                  Country
                </span>
                <CountrySelect value={country} onChange={(v) => onFilterChange("country", v)} className="w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
