"use client";

import { useState } from "react";
import { Check, GripVertical, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ALL_KPI_METRICS,
  DEFAULT_KPI_CARDS,
  KPI_METRIC_META,
  type KpiMetricId,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type { Totals } from "@/lib/types";

interface OverviewStatsProps {
  totals: Totals;
  label?: string;
  itemCount?: number;
  unitLabel?: string;
  kpiCards: KpiMetricId[];
  onUpdateKpiCards?: (next: KpiMetricId[]) => void;
  activeMetric?: KpiMetricId;
  onSelectMetric?: (metric: KpiMetricId) => void;
}

function getGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 sm:grid-cols-1";
  if (count === 2) return "grid-cols-2 sm:grid-cols-2";
  if (count === 3 || count === 5 || count === 6) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-4";
}

export function OverviewStats({
  totals,
  label = "All time",
  itemCount = 1,
  unitLabel = "period",
  kpiCards,
  onUpdateKpiCards,
  activeMetric,
  onSelectMetric,
}: OverviewStatsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<KpiMetricId | null>(null);
  const [dragOverId, setDragOverId] = useState<KpiMetricId | null>(null);

  const visibleCards = kpiCards.length > 0 ? kpiCards : DEFAULT_KPI_CARDS;
  const hiddenCards = ALL_KPI_METRICS.filter((id) => !visibleCards.includes(id));

  function handleRemoveCard(id: KpiMetricId) {
    if (!onUpdateKpiCards || visibleCards.length <= 1) return;
    onUpdateKpiCards(visibleCards.filter((item) => item !== id));
  }

  function handleAddCard(id: KpiMetricId) {
    if (!onUpdateKpiCards || visibleCards.includes(id)) return;
    onUpdateKpiCards([...visibleCards, id]);
  }

  function handleResetCards() {
    if (!onUpdateKpiCards) return;
    onUpdateKpiCards(DEFAULT_KPI_CARDS);
  }

  function reorderCards(sourceId: KpiMetricId, targetId: KpiMetricId) {
    if (!onUpdateKpiCards || sourceId === targetId) return;
    const fromIdx = visibleCards.indexOf(sourceId);
    const toIdx = visibleCards.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...visibleCards];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, sourceId);
    onUpdateKpiCards(next);
  }

  function handleMoveStep(id: KpiMetricId, delta: -1 | 1) {
    if (!onUpdateKpiCards) return;
    const idx = visibleCards.indexOf(id);
    const targetIdx = idx + delta;
    if (idx === -1 || targetIdx < 0 || targetIdx >= visibleCards.length) return;
    reorderCards(id, visibleCards[targetIdx]);
  }

  return (
    <div className="space-y-2">
      {(onUpdateKpiCards || onSelectMetric) && (
        <div className="flex flex-wrap items-center justify-between gap-2 min-h-6">
          <div className="text-[11px] text-muted-foreground">
            {isEditing
              ? "Drag cards to reorder · Click × to hide · Add metrics below"
              : onSelectMetric
                ? "Click a card to switch chart metric"
                : null}
          </div>
          {onUpdateKpiCards && (
            <div className="flex items-center gap-1.5 ml-auto">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleResetCards}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </Button>
              )}
              <Button
                type="button"
                variant={isEditing ? "secondary" : "ghost"}
                size="xs"
                onClick={() => {
                  setIsEditing((prev) => !prev);
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={isEditing ? "" : "text-muted-foreground hover:text-foreground"}
              >
                {isEditing ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Done</span>
                  </>
                ) : (
                  <>
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>Customize</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={cn("grid gap-3", getGridClass(visibleCards.length))}>
        {visibleCards.map((id) => {
          const meta = KPI_METRIC_META[id];
          const value = meta.formatKpiValue(totals, itemCount);
          const sub = meta.getKpiSub(totals, label, itemCount, unitLabel);
          const isChartInteractive = !isEditing && Boolean(onSelectMetric);
          const isActive = !isEditing && Boolean(onSelectMetric) && activeMetric === id;
          const isDragged = draggedId === id;
          const isDragTarget = dragOverId === id && draggedId !== null && draggedId !== id;

          return (
            <Card
              key={id}
              draggable={isEditing}
              onDragStart={(e) => {
                if (!isEditing) return;
                setDraggedId(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                if (!isEditing || !draggedId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== id) setDragOverId(id);
              }}
              onDragLeave={() => {
                if (dragOverId === id) setDragOverId(null);
              }}
              onDrop={(e) => {
                if (!isEditing) return;
                e.preventDefault();
                const dropped = (e.dataTransfer.getData("text/plain") || draggedId) as KpiMetricId;
                if (dropped) {
                  reorderCards(dropped, id);
                }
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              role={isChartInteractive ? "button" : undefined}
              tabIndex={isChartInteractive ? 0 : undefined}
              aria-pressed={isChartInteractive ? isActive : undefined}
              onClick={() => {
                if (isChartInteractive && onSelectMetric) {
                  onSelectMetric(id);
                }
              }}
              onKeyDown={(e) => {
                if (!isChartInteractive || !onSelectMetric) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectMetric(id);
                }
              }}
              style={
                isActive
                  ? {
                      boxShadow: `0 0 0 1.5px ${meta.accentColor}`,
                    }
                  : undefined
              }
              className={cn(
                "relative transition-all select-none",
                isChartInteractive &&
                  "cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "bg-accent/25",
                isEditing && "cursor-grab active:cursor-grabbing ring-dashed",
                isDragged && "opacity-45 scale-[0.98]",
                isDragTarget && "ring-2 ring-primary bg-primary/5"
              )}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isEditing && (
                      <button
                        type="button"
                        aria-label={`Reorder ${meta.title} (use left/right arrows)`}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                            e.preventDefault();
                            handleMoveStep(id, -1);
                          } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                            e.preventDefault();
                            handleMoveStep(id, 1);
                          }
                        }}
                        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: meta.accentColor }}
                      />
                    )}
                    <CardTitle
                      className={cn(
                        "text-xs font-medium uppercase tracking-wide truncate",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {meta.title}
                    </CardTitle>
                  </div>
                  {isEditing && visibleCards.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Hide ${meta.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCard(id);
                      }}
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <p className="text-2xl font-semibold font-mono">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isEditing && hiddenCards.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Add card:</span>
          {hiddenCards.map((id) => {
            const meta = KPI_METRIC_META[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleAddCard(id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Plus className="h-3 w-3" />
                <span>{meta.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
