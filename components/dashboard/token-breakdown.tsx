"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatTokens } from "@/lib/utils";
import type { Totals } from "@/lib/types";

interface TokenBreakdownProps {
  totals: Totals;
}

const SEGMENTS = [
  { key: "cacheReadTokens", label: "Cache Read", color: "#10b981" },
  { key: "cacheCreationTokens", label: "Cache Write", color: "#f59e0b" },
  { key: "inputTokens", label: "Input", color: "#8b5cf6" },
  { key: "outputTokens", label: "Output", color: "#3b82f6" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

export function TokenBreakdown({ totals }: TokenBreakdownProps) {
  const [hoveredKey, setHoveredKey] = useState<SegmentKey | null>(null);

  const segmentSum = SEGMENTS.reduce((sum, s) => sum + Math.max(0, totals[s.key] ?? 0), 0);
  const total = segmentSum > 0 ? segmentSum : Math.max(0, totals.totalTokens ?? 0);

  const items = SEGMENTS.map((s) => {
    const value = Math.max(0, totals[s.key] ?? 0);
    const percent = total > 0 ? (value / total) * 100 : 0;
    return {
      ...s,
      value,
      percent,
    };
  });

  const nonZeroItems = items.filter((item) => item.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Token Distribution</CardTitle>
          <span className="text-xs font-mono text-muted-foreground">
            Total {formatTokens(total)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Horizontal 100% stacked bar */}
        <div
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Token distribution across ${nonZeroItems.map((i) => `${i.label} ${i.percent.toFixed(1)}%`).join(", ")}`}
        >
          {nonZeroItems.map((item) => {
            const isDimmed = hoveredKey !== null && hoveredKey !== item.key;
            return (
              <div
                key={item.key}
                title={`${item.label}: ${formatTokens(item.value)} (${item.percent.toFixed(1)}%)`}
                onMouseEnter={() => setHoveredKey(item.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  width: `${item.percent}%`,
                  backgroundColor: item.color,
                }}
                className={cn(
                  "h-full transition-opacity duration-150 first:rounded-l-full last:rounded-r-full",
                  isDimmed && "opacity-35"
                )}
              />
            );
          })}
        </div>

        {/* 4 compact breakdown cards underneath */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {items.map((item) => {
            const isHighlighted = hoveredKey === item.key;
            return (
              <div
                key={item.key}
                onMouseEnter={() => setHoveredKey(item.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className={cn(
                  "rounded-lg border border-border/70 bg-muted/25 px-3 py-2 transition-colors",
                  isHighlighted && "border-foreground/30 bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-muted-foreground truncate">{item.label}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {item.percent.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 font-mono text-base font-semibold">
                  {formatTokens(item.value)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
