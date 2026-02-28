"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BimiCheckItem } from "@/lib/bimi/types";
import { useState } from "react";

const STATUS_ICON: Record<BimiCheckItem["status"], { icon: string; color: string }> = {
  pass: { icon: "\u2713", color: "text-emerald-600 dark:text-emerald-400" },
  fail: { icon: "\u2717", color: "text-destructive" },
  warn: { icon: "\u26A0", color: "text-amber-500 dark:text-amber-400" },
  skip: { icon: "\u2014", color: "text-muted-foreground" },
  info: { icon: "i", color: "text-blue-500 dark:text-blue-400" },
};

const LPS_EXPLANATION =
  "Local-Part Selector allows different logos for different email addresses (e.g., alice@example.com vs support@example.com)";

function CheckItemCard({ item }: { item: BimiCheckItem }) {
  const [expanded, setExpanded] = useState(false);
  const { icon, color } = STATUS_ICON[item.status];
  const hasDetail = !!item.detail || !!item.specRef;
  const isLps = item.id === "bimi-lps";

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`mt-0.5 text-lg font-bold leading-none ${color}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isLps ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium text-sm cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/50">
                    {item.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {LPS_EXPLANATION}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="font-medium text-sm">{item.label}</span>
          )}
          {item.specRef && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {item.specRef}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{item.summary}</p>
        {item.remediation && (item.status === "fail" || item.status === "warn") && (
          <p className="text-xs text-primary/80 mt-1">
            <span className="font-medium">Fix:</span> {item.remediation}
          </p>
        )}
        {hasDetail && item.detail && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? "Hide details" : "Show details"}
            </button>
            {expanded && (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                {item.detail}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ValidationChecklist({ checks }: { checks: BimiCheckItem[] }) {
  const specChecks = checks.filter((c) => c.category === "spec");
  const compatChecks = checks.filter((c) => c.category === "compatibility");

  const specFailCount = specChecks.filter(
    (c) => c.status === "fail" || c.status === "warn"
  ).length;
  const compatFailCount = compatChecks.filter(
    (c) => c.status === "fail" || c.status === "warn"
  ).length;

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="spec">
          <TabsList className="mb-4">
            <TabsTrigger value="spec">
              Spec Compliance
              {specFailCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                  {specFailCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="compat">
              Client Compatibility
              {compatFailCount > 0 && (
                <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-amber-500 text-white hover:bg-amber-600">
                  {compatFailCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="spec">
            <div className="divide-y">
              {specChecks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No spec checks available</p>
              ) : (
                specChecks.map((item) => (
                  <CheckItemCard key={item.id} item={item} />
                ))
              )}
            </div>
          </TabsContent>
          <TabsContent value="compat">
            <div className="divide-y">
              {compatChecks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No compatibility checks available</p>
              ) : (
                compatChecks.map((item) => (
                  <CheckItemCard key={item.id} item={item} />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
