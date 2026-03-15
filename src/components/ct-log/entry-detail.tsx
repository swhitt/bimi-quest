"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DecodedCTEntry } from "@/lib/ct/decode-entry";
import { CertSummary } from "./cert-summary";
import { ChainViewer } from "./chain-viewer";
import { HexViewer } from "./hex-viewer";
import { LogoTab } from "./logo-tab";
import { RawDataPanel } from "./raw-data-panel";

export const ENTRY_TABS = ["overview", "logo", "chain", "binary", "raw"] as const;

interface EntryDetailProps {
  entry: DecodedCTEntry;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function EntryDetail({ entry, activeTab = "overview", onTabChange }: EntryDetailProps) {
  return (
    <Card className="h-fit">
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm font-medium">Entry #{entry.index.toLocaleString()}</p>

          <Tabs value={activeTab} onValueChange={onTabChange}>
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="logo" className="text-xs">
                Logo
              </TabsTrigger>
              <TabsTrigger value="chain" className="text-xs">
                Chain
              </TabsTrigger>
              <TabsTrigger value="binary" className="text-xs">
                Binary
              </TabsTrigger>
              <TabsTrigger value="raw" className="text-xs">
                Raw
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="min-h-0 mt-2">
              {entry.cert ? (
                <CertSummary cert={entry.cert} leaf={entry.leaf} />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Certificate could not be parsed</p>
              )}
            </TabsContent>

            <TabsContent value="logo" className="min-h-0 mt-2">
              <LogoTab svg={entry.cert?.logotypeSvg ?? null} fingerprint={entry.cert?.fingerprint} />
            </TabsContent>

            <TabsContent value="chain" className="min-h-0 mt-2">
              <ChainViewer chain={entry.chain} cert={entry.cert} />
            </TabsContent>

            <TabsContent value="binary" className="min-h-0 mt-2">
              <HexViewer data={entry.raw.leafHex} byteMap={entry.byteMap} />
            </TabsContent>

            <TabsContent value="raw" className="min-h-0 mt-2">
              <RawDataPanel raw={entry.raw} certPem={entry.cert?.certPem ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
