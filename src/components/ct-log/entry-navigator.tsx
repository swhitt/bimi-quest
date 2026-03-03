"use client";

import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EntryNavigatorProps {
  startIndex: number;
  pageSize: number;
  treeSize: number;
  onNavigate: (newStart: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50];

export function EntryNavigator({ startIndex, pageSize, treeSize, onNavigate, onPageSizeChange }: EntryNavigatorProps) {
  const [jumpValue, setJumpValue] = useState("");

  const atStart = startIndex <= 0;
  const atEnd = startIndex + pageSize >= treeSize;

  function handleJump() {
    const parsed = parseInt(jumpValue, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    onNavigate(Math.min(parsed, Math.max(0, treeSize - 1)));
    setJumpValue("");
  }

  function handlePrev() {
    onNavigate(Math.max(0, startIndex - pageSize));
  }

  function handleNext() {
    onNavigate(startIndex + pageSize);
  }

  function handleLatest() {
    onNavigate(Math.max(0, treeSize - pageSize));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Jump to index */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleJump();
        }}
        className="flex items-center gap-1.5"
      >
        <Input
          type="number"
          min={0}
          placeholder="Index"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          className="w-28 h-8 text-sm tabular-nums"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!jumpValue}>
          Go
        </Button>
      </form>

      {/* Latest */}
      <Button variant="outline" size="sm" onClick={handleLatest} disabled={atEnd}>
        <ChevronsRight className="size-4" />
        Latest
      </Button>

      {/* Prev / Next */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" onClick={handlePrev} disabled={atStart} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={handleNext} disabled={atEnd} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Range indicator */}
      <span className="text-xs text-muted-foreground tabular-nums">
        {startIndex.toLocaleString()}&ndash;{Math.min(startIndex + pageSize - 1, treeSize - 1).toLocaleString()}
        {" of "}
        {treeSize.toLocaleString()}
      </span>

      {/* Page size */}
      <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
        <SelectTrigger size="sm" className="w-auto text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
