"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RangePresetOption {
  value: string;
  label: string;
  description?: string;
}

interface DateRangeFilterProps {
  type: "date" | "month";
  from: string;
  to: string;
  min?: string;
  max?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onReset: () => void;
  hasActiveFilter: boolean;
  selectedLabel?: string | null;
  onClearSelected?: () => void;
  presets?: readonly RangePresetOption[];
  activePreset?: string | null;
  onSelectPreset?: (value: string) => void;
}

export function DateRangeFilter({
  type,
  from,
  to,
  min,
  max,
  onFromChange,
  onToChange,
  onReset,
  hasActiveFilter,
  selectedLabel,
  onClearSelected,
  presets,
  activePreset,
  onSelectPreset,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {presets && presets.length > 0 && onSelectPreset && (
          <div className="flex items-center gap-1 pr-1 sm:border-r sm:border-border sm:pr-3" role="group" aria-label="Quick date range">
            {presets.map((p) => {
              const isActive = activePreset === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={isActive}
                  title={p.description ?? p.label}
                  onClick={() => onSelectPreset(p.value)}
                  className={[
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>From</span>
          <input
            type={type}
            value={from}
            min={min}
            max={to || max}
            onChange={(e) => onFromChange(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:[color-scheme:dark]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>To</span>
          <input
            type={type}
            value={to}
            min={from || min}
            max={max}
            onChange={(e) => onToChange(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:[color-scheme:dark]"
          />
        </label>
        {selectedLabel && onClearSelected && (
          <Badge variant="secondary" className="gap-1 font-mono text-xs pr-1">
            <span>Day: {selectedLabel}</span>
            <button
              type="button"
              onClick={onClearSelected}
              aria-label="Clear selected day"
              className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReset}
        disabled={!hasActiveFilter}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Reset
      </Button>
    </div>
  );
}
