"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { KPI_METRIC_META, type KpiMetricId } from "@/lib/metrics";
import type { DailyEntry } from "@/lib/types";

interface DailySpendChartProps {
  allDays: DailyEntry[];
  visibleDays: DailyEntry[];
  selectedDate: string | null;
  metric?: KpiMetricId;
  onSelectDate: (date: string) => void;
  onRangeCommit: (nextFrom: string, nextTo: string) => void;
}

interface PlotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragState {
  side: "left" | "right";
  visualRelX: number;
  previewIdx: number;
  isExpanding: boolean;
  viewStart: number;
  viewEnd: number;
}

interface DragMeta {
  side: "left" | "right";
  plotLeft: number;
  plotWidth: number;
  viewStart: number;
  viewEnd: number;
  previewIdx: number;
  overshootPx: number;
  isExpanding: boolean;
}

interface ChartPoint {
  idx: number;
  date: string;
  value: number;
}

interface TooltipPayloadItem {
  value?: number;
  payload?: ChartPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  hidden?: boolean;
  metric: KpiMetricId;
}

function CustomTooltip({ active, payload, label, hidden, metric }: CustomTooltipProps) {
  if (hidden || !active || !payload?.length) return null;
  const meta = KPI_METRIC_META[metric];
  const value = payload[0]?.value ?? 0;
  const dateLabel = payload[0]?.payload?.date ?? String(label ?? "");
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium font-mono text-xs">{dateLabel}</p>
      <p className="font-mono font-medium" style={{ color: meta.accentColor }}>
        {meta.formatTooltipValue(value)}
      </p>
    </div>
  );
}

function sampleMetricAt(days: DailyEntry[], x: number, getVal: (d: DailyEntry) => number): number {
  if (days.length === 0) return 0;
  const clamped = Math.max(0, Math.min(days.length - 1, x));
  const lo = Math.floor(clamped);
  const hi = Math.min(days.length - 1, Math.ceil(clamped));
  if (lo === hi) return getVal(days[lo]);
  const t = clamped - lo;
  return getVal(days[lo]) * (1 - t) + getVal(days[hi]) * t;
}

function computeContinuousYMax(
  days: DailyEntry[],
  viewStart: number,
  viewEnd: number,
  metric: KpiMetricId
): number {
  const meta = KPI_METRIC_META[metric];
  if (days.length === 0) return 1;
  let max = Math.max(
    sampleMetricAt(days, viewStart, meta.getSeriesValue),
    sampleMetricAt(days, viewEnd, meta.getSeriesValue)
  );
  const lo = Math.max(0, Math.ceil(viewStart));
  const hi = Math.min(days.length - 1, Math.floor(viewEnd));
  for (let i = lo; i <= hi; i++) {
    const v = meta.getSeriesValue(days[i]);
    if (v > max) max = v;
  }
  if (meta.unit === "percent") {
    return max > 0 ? Math.min(100, max * 1.08) : 100;
  }
  return max > 0 ? max * 1.08 : 1;
}

const DEFAULT_PLOT_BOX: PlotBox = { left: 56, top: 4, width: 0, height: 186 };

export function DailySpendChart({
  allDays,
  visibleDays,
  selectedDate,
  metric = "totalCost",
  onSelectDate,
  onRangeCommit,
}: DailySpendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragMetaRef = useRef<DragMeta | null>(null);
  const suppressClickRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  const [plotBox, setPlotBox] = useState<PlotBox>(DEFAULT_PLOT_BOX);
  const [drag, setDrag] = useState<DragState | null>(null);

  const meta = KPI_METRIC_META[metric];

  const chartData = useMemo<ChartPoint[]>(
    () => allDays.map((d, idx) => ({ idx, date: d.date, value: meta.getSeriesValue(d) })),
    [allDays, meta]
  );

  // Measure actual Recharts cartesian grid bounds so edge handles sit directly on the plot edges.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const measure = () => {
      const grid = container.querySelector(".recharts-cartesian-grid");
      if (!grid) {
        rafId = requestAnimationFrame(measure);
        return;
      }
      const cRect = container.getBoundingClientRect();
      const gRect = grid.getBoundingClientRect();
      if (gRect.width > 0 && gRect.height > 0) {
        const next = {
          left: gRect.left - cRect.left,
          top: gRect.top - cRect.top,
          width: gRect.width,
          height: gRect.height,
        };
        setPlotBox((prev) =>
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
            ? prev
            : next
        );
      }
    };

    rafId = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [visibleDays.length, metric]);

  const { startIdx, endIdx } = useMemo(() => {
    if (allDays.length === 0 || visibleDays.length === 0) {
      return { startIdx: 0, endIdx: Math.max(0, allDays.length - 1) };
    }
    const first = visibleDays[0].date;
    const last = visibleDays[visibleDays.length - 1].date;
    const s = allDays.findIndex((d) => d.date >= first);
    let e = -1;
    for (let i = allDays.length - 1; i >= 0; i--) {
      if (allDays[i].date <= last) {
        e = i;
        break;
      }
    }
    return {
      startIdx: s === -1 ? 0 : s,
      endIdx: e === -1 ? allDays.length - 1 : e,
    };
  }, [allDays, visibleDays]);

  const allDaysRef = useRef(allDays);
  useEffect(() => {
    allDaysRef.current = allDays;
  }, [allDays]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const activeViewStart = drag ? drag.viewStart : startIdx;
  const activeViewEnd = drag ? drag.viewEnd : endIdx;

  const xDomain = useMemo<[number, number]>(() => {
    if (activeViewEnd - activeViewStart < 0.5) {
      return [activeViewStart - 0.5, activeViewEnd + 0.5];
    }
    return [activeViewStart, activeViewEnd];
  }, [activeViewStart, activeViewEnd]);

  const xTicks = useMemo(() => {
    if (allDays.length === 0) return [];
    const span = Math.max(1, activeViewEnd - activeViewStart);
    const step = Math.max(1, Math.ceil(span / 8));
    const minInt = Math.max(0, Math.ceil(activeViewStart));
    const maxInt = Math.min(allDays.length - 1, Math.floor(activeViewEnd));
    const ticks: number[] = [];
    const firstTick = Math.ceil(minInt / step) * step;
    for (let i = firstTick; i <= maxInt; i += step) {
      ticks.push(i);
    }
    return ticks;
  }, [allDays.length, activeViewStart, activeViewEnd]);

  const selectedIdx = useMemo(() => {
    if (!selectedDate) return null;
    const idx = allDays.findIndex((d) => d.date === selectedDate);
    return idx === -1 ? null : idx;
  }, [allDays, selectedDate]);

  const avgCostLine = useMemo(() => {
    if (metric !== "avgCost" || visibleDays.length === 0) return null;
    return visibleDays.reduce((sum, d) => sum + d.totalCost, 0) / visibleDays.length;
  }, [metric, visibleDays]);

  function handleChartClick(
    state: MouseHandlerDataParam,
    event: React.MouseEvent<SVGGraphicsElement>
  ) {
    if (suppressClickRef.current) return;
    let clickedDate: string | undefined;

    if (visibleDays.length > 0 && containerRef.current && event.clientX > 0) {
      const grid = containerRef.current.querySelector(".recharts-cartesian-grid");
      const gRect = grid?.getBoundingClientRect();
      if (gRect && gRect.width > 0 && event.clientX >= gRect.left && event.clientX <= gRect.right) {
        const ratio = (event.clientX - gRect.left) / gRect.width;
        const idx =
          startIdx === endIdx
            ? startIdx
            : Math.max(
                startIdx,
                Math.min(endIdx, Math.round(startIdx + ratio * (endIdx - startIdx)))
              );
        clickedDate = allDays[idx]?.date;
      }
    }

    if (!clickedDate && state.activeTooltipIndex !== undefined && state.activeTooltipIndex !== null) {
      const idx = Number(state.activeTooltipIndex);
      if (Number.isInteger(idx) && idx >= 0 && idx < allDays.length) {
        clickedDate = allDays[idx]?.date;
      }
    }

    if (clickedDate) {
      onSelectDate(clickedDate);
    }
  }

  function stopEdgeScroll() {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }

  function startEdgeScroll() {
    if (scrollRafRef.current !== null) return;

    let lastTime = performance.now();

    const tick = (now: number) => {
      const metaDrag = dragMetaRef.current;
      if (!metaDrag || !metaDrag.isExpanding || metaDrag.overshootPx <= 0) {
        scrollRafRef.current = null;
        return;
      }

      const days = allDaysRef.current;
      if (
        (metaDrag.side === "left" && metaDrag.viewStart <= 0) ||
        (metaDrag.side === "right" && metaDrag.viewEnd >= days.length - 1)
      ) {
        scrollRafRef.current = null;
        return;
      }

      const dtSec = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const normalized = Math.min(metaDrag.overshootPx / 160, 2);
      const daysPerSecond = 2.5 + 32 * normalized * normalized;
      const delta = daysPerSecond * dtSec;

      if (metaDrag.side === "left") {
        metaDrag.viewStart = Math.max(0, metaDrag.viewStart - delta);
        metaDrag.previewIdx = Math.round(metaDrag.viewStart);
      } else {
        metaDrag.viewEnd = Math.min(days.length - 1, metaDrag.viewEnd + delta);
        metaDrag.previewIdx = Math.round(metaDrag.viewEnd);
      }

      setDrag((prev) =>
        prev
          ? {
              ...prev,
              viewStart: metaDrag.viewStart,
              viewEnd: metaDrag.viewEnd,
              previewIdx: metaDrag.previewIdx,
            }
          : prev
      );

      scrollRafRef.current = requestAnimationFrame(tick);
    };

    scrollRafRef.current = requestAnimationFrame(tick);
  }

  const activeYMax = useMemo(
    () => computeContinuousYMax(allDays, activeViewStart, activeViewEnd, metric),
    [allDays, activeViewStart, activeViewEnd, metric]
  );

  function startDrag(side: "left" | "right", e: React.PointerEvent<HTMLDivElement>) {
    if (allDays.length < 2 || visibleDays.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const grid = container.querySelector(".recharts-cartesian-grid");
    const cRect = container.getBoundingClientRect();
    const gRect = grid?.getBoundingClientRect();
    const plotLeft = gRect && gRect.width > 0 ? gRect.left - cRect.left : plotBox.left;
    const plotWidth = gRect && gRect.width > 0 ? gRect.width : plotBox.width;
    const absPlotLeft = gRect && gRect.width > 0 ? gRect.left : cRect.left + plotLeft;

    const initialIdx = side === "left" ? startIdx : endIdx;
    dragMetaRef.current = {
      side,
      plotLeft: absPlotLeft,
      plotWidth,
      viewStart: startIdx,
      viewEnd: endIdx,
      previewIdx: initialIdx,
      overshootPx: 0,
      isExpanding: false,
    };

    setDrag({
      side,
      visualRelX: side === "left" ? 0 : plotWidth,
      previewIdx: initialIdx,
      isExpanding: false,
      viewStart: startIdx,
      viewEnd: endIdx,
    });
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const metaDrag = dragMetaRef.current;
    if (!metaDrag) return;

    const days = allDaysRef.current;
    const relX = e.clientX - metaDrag.plotLeft;
    let previewIdx = metaDrag.previewIdx;
    let visualRelX = 0;
    let overshootPx = 0;
    let isExpanding = false;

    if (metaDrag.side === "left") {
      if (relX < 0 && metaDrag.viewStart > 0) {
        overshootPx = -relX;
        previewIdx = Math.round(metaDrag.viewStart);
        visualRelX = -Math.min(10, overshootPx * 0.12);
        isExpanding = true;
      } else {
        const curStart = Math.max(0, Math.round(metaDrag.viewStart));
        const curEnd = Math.min(days.length - 1, Math.round(metaDrag.viewEnd));
        metaDrag.viewStart = curStart;
        const clampedRelX = Math.max(0, Math.min(metaDrag.plotWidth, relX));
        const ratio = metaDrag.plotWidth > 0 ? clampedRelX / metaDrag.plotWidth : 0;
        const span = curEnd - curStart;
        previewIdx = Math.min(curEnd, curStart + Math.round(ratio * span));
        visualRelX = clampedRelX;
      }
    } else {
      if (relX > metaDrag.plotWidth && metaDrag.viewEnd < days.length - 1) {
        overshootPx = relX - metaDrag.plotWidth;
        previewIdx = Math.round(metaDrag.viewEnd);
        visualRelX = metaDrag.plotWidth + Math.min(10, overshootPx * 0.12);
        isExpanding = true;
      } else {
        const curStart = Math.max(0, Math.round(metaDrag.viewStart));
        const curEnd = Math.min(days.length - 1, Math.round(metaDrag.viewEnd));
        metaDrag.viewEnd = curEnd;
        const clampedRelX = Math.max(0, Math.min(metaDrag.plotWidth, relX));
        const ratio = metaDrag.plotWidth > 0 ? clampedRelX / metaDrag.plotWidth : 1;
        const span = curEnd - curStart;
        previewIdx = Math.max(curStart, curStart + Math.round(ratio * span));
        visualRelX = clampedRelX;
      }
    }

    metaDrag.previewIdx = previewIdx;
    metaDrag.overshootPx = overshootPx;
    metaDrag.isExpanding = isExpanding;

    if (isExpanding) {
      startEdgeScroll();
    } else {
      stopEdgeScroll();
    }

    setDrag({
      side: metaDrag.side,
      visualRelX,
      previewIdx,
      isExpanding,
      viewStart: metaDrag.viewStart,
      viewEnd: metaDrag.viewEnd,
    });
  }

  function finishDrag(e: React.PointerEvent<HTMLDivElement>) {
    const metaDrag = dragMetaRef.current;
    if (!metaDrag) return;

    stopEdgeScroll();

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const days = allDaysRef.current;
    const nextStartIdx =
      metaDrag.side === "left"
        ? metaDrag.isExpanding
          ? Math.max(0, Math.min(endIdx, Math.round(metaDrag.viewStart)))
          : metaDrag.previewIdx
        : Math.max(0, Math.round(metaDrag.viewStart));
    const nextEndIdx =
      metaDrag.side === "right"
        ? metaDrag.isExpanding
          ? Math.min(days.length - 1, Math.max(startIdx, Math.round(metaDrag.viewEnd)))
          : metaDrag.previewIdx
        : Math.min(days.length - 1, Math.round(metaDrag.viewEnd));

    dragMetaRef.current = null;
    setDrag(null);
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (nextStartIdx !== startIdx || nextEndIdx !== endIdx) {
      const nextFrom = nextStartIdx === 0 ? "" : days[nextStartIdx].date;
      const nextTo = nextEndIdx === days.length - 1 ? "" : days[nextEndIdx].date;
      onRangeCommit(nextFrom, nextTo);
    }
  }

  function handleSliderKeyDown(side: "left" | "right", e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? -1 : 1;
    const nextStartIdx =
      side === "left" ? Math.max(0, Math.min(endIdx, startIdx + delta)) : startIdx;
    const nextEndIdx =
      side === "right"
        ? Math.max(startIdx, Math.min(allDays.length - 1, endIdx + delta))
        : endIdx;

    if (nextStartIdx !== startIdx || nextEndIdx !== endIdx) {
      const nextFrom = nextStartIdx === 0 ? "" : allDays[nextStartIdx].date;
      const nextTo = nextEndIdx === allDays.length - 1 ? "" : allDays[nextEndIdx].date;
      onRangeCommit(nextFrom, nextTo);
    }
  }

  const isDragging = Boolean(drag);

  const renderDot = useCallback(
    (dotProps: { cx?: number; cy?: number; payload?: ChartPoint }) => {
      const { payload, cx, cy } = dotProps;
      if (!payload || cx === undefined || cy === undefined) {
        return null;
      }
      if (payload.idx < Math.floor(activeViewStart) || payload.idx > Math.ceil(activeViewEnd)) {
        return null;
      }
      const isSelected = payload.date === selectedDate;
      if (!isSelected && visibleDays.length > 1) return null;
      return (
        <circle
          key={payload.date}
          cx={cx}
          cy={cy}
          r={isSelected ? 5 : 3.5}
          fill={meta.accentColor}
          stroke="var(--background)"
          strokeWidth={2}
        />
      );
    },
    [selectedDate, visibleDays.length, activeViewStart, activeViewEnd, meta.accentColor]
  );

  if (visibleDays.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No daily data in selected date range
      </div>
    );
  }

  const showHandles = allDays.length >= 2 && plotBox.width > 0;
  const leftGuideX =
    drag?.side === "left" ? plotBox.left + drag.visualRelX : plotBox.left;
  const rightGuideX =
    drag?.side === "right" ? plotBox.left + drag.visualRelX : plotBox.left + plotBox.width;
  const previewDate = drag ? allDays[drag.previewIdx]?.date : null;
  const canExpandLeft = activeViewStart > 0;
  const canExpandRight = activeViewEnd < allDays.length - 1;

  return (
    <div ref={containerRef} className="relative select-none">
      <div className={drag ? "cursor-ew-resize" : "cursor-pointer"}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            onClick={handleChartClick}
          >
            <defs>
              <linearGradient id="dailyMetricGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={meta.accentColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={meta.accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="idx"
              domain={xDomain}
              ticks={xTicks}
              allowDataOverflow
              tickFormatter={(idx) => allDays[Math.round(Number(idx))]?.date.slice(5) ?? ""}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, activeYMax]}
              allowDataOverflow
              tickFormatter={(v) => meta.formatAxisTick(Number(v))}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip content={<CustomTooltip hidden={isDragging} metric={metric} />} />
            {avgCostLine !== null && (
              <ReferenceLine
                y={avgCostLine}
                stroke={meta.accentColor}
                strokeDasharray="4 4"
                strokeOpacity={0.65}
              />
            )}
            {selectedIdx !== null &&
              selectedIdx >= activeViewStart &&
              selectedIdx <= activeViewEnd && (
                <ReferenceLine
                  x={selectedIdx}
                  stroke={meta.accentColor}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
              )}
            <Area
              type="monotone"
              dataKey="value"
              baseValue={0}
              stroke={meta.accentColor}
              strokeWidth={2}
              fill="url(#dailyMetricGradient)"
              isAnimationActive={false}
              dot={renderDot}
              activeDot={{ r: 4, fill: meta.accentColor, stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Shaded cut-off preview overlay when dragging inward */}
      {drag && !drag.isExpanding && plotBox.width > 0 && (
        <div
          className="pointer-events-none absolute bg-background/65 backdrop-blur-[1px]"
          style={
            drag.side === "left"
              ? {
                  left: plotBox.left,
                  top: plotBox.top,
                  width: Math.max(0, Math.min(plotBox.width, drag.visualRelX)),
                  height: plotBox.height,
                }
              : {
                  left: plotBox.left + Math.max(0, Math.min(plotBox.width, drag.visualRelX)),
                  top: plotBox.top,
                  width: Math.max(0, plotBox.width - Math.max(0, Math.min(plotBox.width, drag.visualRelX))),
                  height: plotBox.height,
                }
          }
        />
      )}

      {/* Draggable left & right edge guides */}
      {showHandles && (
        <>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Adjust start date"
            aria-valuemin={0}
            aria-valuemax={endIdx}
            aria-valuenow={drag?.side === "left" ? drag.previewIdx : startIdx}
            aria-valuetext={visibleDays[0]?.date}
            title={
              canExpandLeft
                ? "Drag right to narrow, or drag past left edge to smoothly scroll earlier"
                : "Drag right to narrow start date"
            }
            onPointerDown={(e) => startDrag("left", e)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onKeyDown={(e) => handleSliderKeyDown("left", e)}
            style={{
              left: leftGuideX - 6,
              top: plotBox.top,
              height: plotBox.height,
            }}
            className="group absolute z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center"
          >
            <div
              className={[
                "h-full w-0.5 transition-colors",
                drag?.side === "left"
                  ? "bg-primary"
                  : canExpandLeft
                    ? "bg-blue-500/70 group-hover:bg-blue-500"
                    : "bg-border group-hover:bg-primary/80",
              ].join(" ")}
            />
            <div
              className={[
                "absolute h-7 w-1.5 rounded-full border bg-background shadow-sm transition-transform",
                drag?.side === "left"
                  ? "scale-110 border-primary"
                  : canExpandLeft
                    ? "border-blue-500/80 group-hover:scale-110"
                    : "border-muted-foreground/50 group-hover:scale-110 group-hover:border-primary",
              ].join(" ")}
            />
            {drag?.side === "left" && previewDate && (
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-1.5 py-0.5 font-mono text-[11px] font-medium text-popover-foreground shadow-md">
                {drag.isExpanding ? `← ${previewDate}` : previewDate}
              </div>
            )}
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Adjust end date"
            aria-valuemin={startIdx}
            aria-valuemax={Math.max(0, allDays.length - 1)}
            aria-valuenow={drag?.side === "right" ? drag.previewIdx : endIdx}
            aria-valuetext={visibleDays[visibleDays.length - 1]?.date}
            title={
              canExpandRight
                ? "Drag left to narrow, or drag past right edge to smoothly scroll later"
                : "Drag left to narrow end date"
            }
            onPointerDown={(e) => startDrag("right", e)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onKeyDown={(e) => handleSliderKeyDown("right", e)}
            style={{
              left: rightGuideX - 6,
              top: plotBox.top,
              height: plotBox.height,
            }}
            className="group absolute z-10 flex w-3 cursor-ew-resize touch-none items-center justify-center"
          >
            <div
              className={[
                "h-full w-0.5 transition-colors",
                drag?.side === "right"
                  ? "bg-primary"
                  : canExpandRight
                    ? "bg-blue-500/70 group-hover:bg-blue-500"
                    : "bg-border group-hover:bg-primary/80",
              ].join(" ")}
            />
            <div
              className={[
                "absolute h-7 w-1.5 rounded-full border bg-background shadow-sm transition-transform",
                drag?.side === "right"
                  ? "scale-110 border-primary"
                  : canExpandRight
                    ? "border-blue-500/80 group-hover:scale-110"
                    : "border-muted-foreground/50 group-hover:scale-110 group-hover:border-primary",
              ].join(" ")}
            />
            {drag?.side === "right" && previewDate && (
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-1.5 py-0.5 font-mono text-[11px] font-medium text-popover-foreground shadow-md">
                {drag.isExpanding ? `${previewDate} →` : previewDate}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
