"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  { key: "?", description: "Show keyboard shortcuts" },
  { key: "/", description: "Focus search" },
  { key: "1", description: "Scroll to KPI strip" },
  { key: "2", description: "Scroll to charts" },
  { key: "3", description: "Scroll to detail panels" },
  { key: "Esc", description: "Close this dialog" },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (target.isContentEditable) return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setOpen((prev) => !prev);
          break;
        case "/": {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
          searchInput?.focus();
          break;
        }
        case "1":
        case "2":
        case "3": {
          const section = document.querySelector<HTMLElement>(`[data-dashboard-section="${e.key}"]`);
          section?.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
        case "Escape":
          setOpen(false);
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[11px] font-mono">{s.key}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
