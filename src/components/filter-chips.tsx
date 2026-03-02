import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface FilterChip {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

export function FilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          <span className="text-muted-foreground">{chip.label}:</span>
          {chip.value}
          <button
            onClick={chip.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {chips.length >= 2 && (
        <Button variant="ghost" size="xs" onClick={onClearAll} className="text-muted-foreground text-xs h-6">
          Clear all
        </Button>
      )}
    </div>
  );
}
