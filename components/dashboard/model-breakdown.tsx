"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCost,
  formatTokens,
  modelColor,
  shortModelName,
  aggregateModelBreakdowns,
} from "@/lib/utils";
import type { ModelBreakdown } from "@/lib/types";

type ModelBreakdownMode = "cost" | "tokens";

interface ModelBreakdownProps {
  breakdowns: ModelBreakdown[];
  mode?: ModelBreakdownMode;
  onConfigureModel?: (modelName: string) => void;
}

interface ChartModelItem extends ModelBreakdown {
  name: string;
  totalTokens: number;
  value: number;
}

function getModelTotalTokens(b: ModelBreakdown): number {
  return b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens;
}

function formatAxisCurrency(v: number): string {
  if (v === 0) return "$0.00";
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function formatAxisTokens(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return Math.round(v).toString();
}

function computeNiceScale(maxVal: number, segments = 4): { max: number; ticks: number[] } {
  if (maxVal <= 0) {
    return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const rawStep = maxVal / segments;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceResidual = 1;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2.5) niceResidual = 5;
  else if (residual > 2) niceResidual = 2.5;
  else if (residual > 1) niceResidual = 2;
  const step = niceResidual * magnitude;
  const max = step * segments;
  const ticks: number[] = [];
  for (let i = 0; i <= segments; i++) {
    ticks.push(Number((step * i).toPrecision(12)));
  }
  return { max, ticks };
}

function wrapModelLabel(name: string, maxLineLen = 18): string[] {
  if (name.length <= maxLineLen) return [name];

  const parts = name.match(/[^-\s/]+[-\s/]?/g) ?? [name];
  const lines: string[] = [];
  let current = "";

  for (const part of parts) {
    if (!current) {
      if (part.length <= maxLineLen) {
        current = part;
      } else {
        for (let i = 0; i < part.length; i += maxLineLen) {
          const chunk = part.slice(i, i + maxLineLen);
          if (i + maxLineLen < part.length) {
            lines.push(chunk);
          } else {
            current = chunk;
          }
        }
      }
      continue;
    }

    if (current.length + part.length <= maxLineLen) {
      current += part;
    } else {
      lines.push(current.trimEnd());
      if (part.length <= maxLineLen) {
        current = part;
      } else {
        current = "";
        for (let i = 0; i < part.length; i += maxLineLen) {
          const chunk = part.slice(i, i + maxLineLen);
          if (i + maxLineLen < part.length) {
            lines.push(chunk);
          } else {
            current = chunk;
          }
        }
      }
    }
  }

  if (current.trimEnd()) {
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [name];
}

interface AngledTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
}

function AngledModelTick({ x = 0, y = 0, payload }: AngledTickProps) {
  const value = String(payload?.value ?? "");
  const lines = wrapModelLabel(value);
  return (
    <g transform={`translate(${x},${y + 4})`}>
      <title>{value}</title>
      <text
        x={0}
        y={0}
        textAnchor="end"
        fill="var(--muted-foreground)"
        fontSize={9.5}
        fontFamily="var(--font-mono)"
        transform="rotate(-48)"
      >
        {lines.map((line, idx) => (
          <tspan key={idx} x={0} dy={idx === 0 ? 3 : 10}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartModelItem }>;
  mode: ModelBreakdownMode;
}

function CustomTooltip({ active, payload, mode }: CustomTooltipProps) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg space-y-1">
      <p className="font-medium font-mono text-xs">{d.modelName}</p>
      <p className="font-mono text-primary font-medium">
        {mode === "tokens" ? `${formatTokens(d.totalTokens)} tokens` : formatCost(d.cost)}
      </p>
      {mode === "tokens" ? (
        <p className="text-muted-foreground text-xs font-mono">Cost: {formatCost(d.cost)}</p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {formatTokens(d.inputTokens)} in · {formatTokens(d.outputTokens)} out
      </p>
      <p className="text-muted-foreground text-xs">
        {formatTokens(d.cacheReadTokens)} cache read · {formatTokens(d.cacheCreationTokens)} cache write
      </p>
    </div>
  );
}

function normalizeWheelStep(rawDelta: number, deltaMode: number): number {
  const pxDelta =
    deltaMode === 1 ? rawDelta * 16 : deltaMode === 2 ? rawDelta * 120 : rawDelta;
  const scaled = pxDelta * 0.42;
  return Math.sign(scaled) * Math.min(Math.abs(scaled), 44);
}

const MIN_BAR_SLOT_PX = 46;
const Y_AXIS_WIDTH = 56;

export function ModelBreakdownChart({
  breakdowns,
  mode = "cost",
  onConfigureModel,
}: ModelBreakdownProps) {
  const scrollViewportId = useId();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRafRef = useRef<number | null>(null);
  const targetScrollRef = useRef(0);
  const floatScrollRef = useRef(0);
  const dragThumbRef = useRef<{
    startX: number;
    startScrollLeft: number;
    maxScroll: number;
    maxThumbLeft: number;
  } | null>(null);

  const [scrollState, setScrollState] = useState({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
    trackWidth: 0,
  });
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);

  const aggregated = useMemo(() => {
    const items = aggregateModelBreakdowns(breakdowns);
    if (mode === "tokens") {
      return [...items].sort((a, b) => getModelTotalTokens(b) - getModelTotalTokens(a));
    }
    return items;
  }, [breakdowns, mode]);

  const chartData = useMemo<ChartModelItem[]>(
    () =>
      aggregated.map((b) => {
        const totalTokens = getModelTotalTokens(b);
        return {
          ...b,
          name: shortModelName(b.modelName),
          totalTokens,
          value: mode === "tokens" ? totalTokens : b.cost,
        };
      }),
    [aggregated, mode]
  );

  const wrappedLabels = useMemo(
    () => chartData.map((item) => wrapModelLabel(item.name)),
    [chartData]
  );

  const maxLineChars = useMemo(
    () =>
      wrappedLabels.reduce(
        (max, lines) => Math.max(max, ...lines.map((line) => line.length)),
        0
      ),
    [wrappedLabels]
  );

  const maxLines = useMemo(
    () => wrappedLabels.reduce((max, lines) => Math.max(max, lines.length), 1),
    [wrappedLabels]
  );

  const firstLabelLeftPad = useMemo(() => {
    const firstLines = wrappedLabels[0] ?? [];
    const firstMaxChars = firstLines.reduce((max, line) => Math.max(max, line.length), 0);
    return Math.max(24, Math.ceil(firstMaxChars * 6 * 0.68 - 10));
  }, [wrappedLabels]);

  const xAxisHeight = Math.max(76, Math.ceil(maxLineChars * 6 * 0.75 + (maxLines - 1) * 8 + 18));
  const chartHeight = 160 + xAxisHeight;
  const minPlotWidth =
    chartData.length > 0 ? firstLabelLeftPad + 16 + chartData.length * MIN_BAR_SLOT_PX : 0;

  const { max: yMax, ticks: yTicks } = useMemo(() => {
    const maxValue = chartData.reduce((m, item) => Math.max(m, item.value), 0);
    return computeNiceScale(maxValue, 4);
  }, [chartData]);

  const stopSmoothScroll = useCallback(() => {
    if (scrollAnimRafRef.current !== null) {
      cancelAnimationFrame(scrollAnimRafRef.current);
      scrollAnimRafRef.current = null;
    }
  }, []);

  const syncScrollMetrics = useCallback(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (scrollAnimRafRef.current === null) {
      floatScrollRef.current = vp.scrollLeft;
      targetScrollRef.current = vp.scrollLeft;
    }
    const trackWidth = trackRef.current?.clientWidth ?? vp.clientWidth;
    setScrollState((prev) => {
      const next = {
        scrollLeft: vp.scrollLeft,
        scrollWidth: vp.scrollWidth,
        clientWidth: vp.clientWidth,
        trackWidth,
      };
      if (
        prev.scrollLeft === next.scrollLeft &&
        prev.scrollWidth === next.scrollWidth &&
        prev.clientWidth === next.clientWidth &&
        prev.trackWidth === next.trackWidth
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    const raf = requestAnimationFrame(syncScrollMetrics);
    const ro = new ResizeObserver(syncScrollMetrics);
    ro.observe(vp);
    if (vp.firstElementChild) {
      ro.observe(vp.firstElementChild);
    }
    if (trackRef.current) {
      ro.observe(trackRef.current);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [syncScrollMetrics, chartData.length, minPlotWidth]);

  useEffect(() => () => stopSmoothScroll(), [stopSmoothScroll]);

  const canScroll = scrollState.scrollWidth > scrollState.clientWidth + 1;
  const maxScroll = Math.max(0, scrollState.scrollWidth - scrollState.clientWidth);
  const trackWidth = Math.max(0, scrollState.trackWidth || scrollState.clientWidth);
  const thumbWidth =
    canScroll && scrollState.scrollWidth > 0 && trackWidth > 0
      ? Math.max(32, Math.round((scrollState.clientWidth / scrollState.scrollWidth) * trackWidth))
      : 0;
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft =
    maxScroll > 0 && maxThumbLeft > 0
      ? Math.min(maxThumbLeft, (scrollState.scrollLeft / maxScroll) * maxThumbLeft)
      : 0;

  const animateScrollTo = useCallback(
    (nextTarget: number) => {
      const vp = scrollViewportRef.current;
      if (!vp) return;
      const maxS = Math.max(0, vp.scrollWidth - vp.clientWidth);
      const clamped = Math.max(0, Math.min(maxS, nextTarget));

      if (scrollAnimRafRef.current === null) {
        floatScrollRef.current = vp.scrollLeft;
      }
      targetScrollRef.current = clamped;

      if (scrollAnimRafRef.current !== null) return;

      let lastTime = performance.now();
      const tick = (now: number) => {
        const el = scrollViewportRef.current;
        if (!el) {
          scrollAnimRafRef.current = null;
          return;
        }
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const diff = targetScrollRef.current - floatScrollRef.current;
        if (Math.abs(diff) <= 0.35) {
          floatScrollRef.current = targetScrollRef.current;
          el.scrollLeft = targetScrollRef.current;
          scrollAnimRafRef.current = null;
          return;
        }
        // Frame-rate independent exponential smoothing
        const factor = 1 - Math.exp(-14 * dt);
        floatScrollRef.current += diff * factor;
        el.scrollLeft = floatScrollRef.current;
        scrollAnimRafRef.current = requestAnimationFrame(tick);
      };

      scrollAnimRafRef.current = requestAnimationFrame(tick);
    },
    []
  );

  function handleThumbPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const vp = scrollViewportRef.current;
    if (!vp || !canScroll || maxThumbLeft <= 0) return;
    stopSmoothScroll();
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragThumbRef.current = {
      startX: e.clientX,
      startScrollLeft: vp.scrollLeft,
      maxScroll,
      maxThumbLeft,
    };
    setIsDraggingThumb(true);
  }

  function handleThumbPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragThumbRef.current;
    const vp = scrollViewportRef.current;
    if (!drag || !vp) return;
    const deltaX = e.clientX - drag.startX;
    const nextScroll = Math.max(
      0,
      Math.min(drag.maxScroll, drag.startScrollLeft + (deltaX / drag.maxThumbLeft) * drag.maxScroll)
    );
    vp.scrollLeft = nextScroll;
    floatScrollRef.current = nextScroll;
    targetScrollRef.current = nextScroll;
  }

  function handleThumbPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragThumbRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragThumbRef.current = null;
    setIsDraggingThumb(false);
  }

  function handleTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !canScroll || maxThumbLeft <= 0) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left - thumbWidth / 2;
    const ratio = Math.max(0, Math.min(1, clickX / maxThumbLeft));
    animateScrollTo(ratio * maxScroll);
  }

  function handleViewportWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!canScroll) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0) {
      e.preventDefault();
      const base =
        scrollAnimRafRef.current !== null
          ? targetScrollRef.current
          : (scrollViewportRef.current?.scrollLeft ?? 0);
      animateScrollTo(base + normalizeWheelStep(e.deltaX, e.deltaMode));
    } else if (e.shiftKey && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const base =
        scrollAnimRafRef.current !== null
          ? targetScrollRef.current
          : (scrollViewportRef.current?.scrollLeft ?? 0);
      animateScrollTo(base + normalizeWheelStep(e.deltaY, e.deltaMode));
    }
  }

  function handleTrackWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!canScroll) return;
    const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (rawDelta === 0) return;
    e.preventDefault();
    const base =
      scrollAnimRafRef.current !== null
        ? targetScrollRef.current
        : (scrollViewportRef.current?.scrollLeft ?? 0);
    animateScrollTo(base + normalizeWheelStep(rawDelta, e.deltaMode));
  }

  function handleScrollbarKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!canScroll) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const base =
      scrollAnimRafRef.current !== null
        ? targetScrollRef.current
        : (scrollViewportRef.current?.scrollLeft ?? 0);
    const delta = e.key === "ArrowLeft" ? -MIN_BAR_SLOT_PX : MIN_BAR_SLOT_PX;
    animateScrollTo(base + delta);
  }

  const formatYTick = mode === "tokens" ? formatAxisTokens : formatAxisCurrency;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">
          {mode === "tokens" ? "Tokens by Model" : "Cost by Model"}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col">
        {chartData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No model usage data
          </div>
        ) : (
          <div>
            <div className="relative flex items-stretch">
              {/* Fixed Y-axis pinned on the left; scrolling models clip behind its right edge */}
              <div
                aria-hidden="true"
                className="relative z-10 shrink-0 bg-card select-none"
                style={{ width: Y_AXIS_WIDTH, height: chartHeight }}
              >
                <BarChart
                  width={Y_AXIS_WIDTH}
                  height={chartHeight}
                  data={[{ name: "", value: 0 }]}
                  margin={{ top: 6, right: 0, left: 0, bottom: 4 }}
                >
                  <XAxis
                    dataKey="name"
                    height={xAxisHeight}
                    tick={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    ticks={yTicks}
                    tickFormatter={(v) => formatYTick(Number(v))}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={Y_AXIS_WIDTH}
                  />
                  <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
                </BarChart>
              </div>

              {/* Horizontally scrollable bars & angled labels with native scrollbar hidden */}
              <div
                id={scrollViewportId}
                ref={scrollViewportRef}
                onScroll={syncScrollMetrics}
                onWheel={handleViewportWheel}
                className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                <div style={{ minWidth: minPlotWidth > 0 ? `${minPlotWidth}px` : undefined }}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        height={xAxisHeight}
                        padding={{ left: firstLabelLeftPad, right: 12 }}
                        tick={<AngledModelTick />}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis domain={[0, yMax]} ticks={yTicks} hide />
                      <Tooltip
                        content={<CustomTooltip mode={mode} />}
                        cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                        {chartData.map((entry) => (
                          <Cell key={entry.modelName} fill={modelColor(entry.modelName)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Custom sleek horizontal scrollbar aligned under the scrollable plot area */}
            {canScroll && (
              <div className="mt-1 flex items-center" style={{ paddingLeft: Y_AXIS_WIDTH }}>
                <div
                  ref={trackRef}
                  role="scrollbar"
                  tabIndex={0}
                  aria-controls={scrollViewportId}
                  aria-label={`Scroll ${mode === "tokens" ? "tokens" : "cost"} by model chart`}
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(maxScroll)}
                  aria-valuenow={Math.round(scrollState.scrollLeft)}
                  onPointerDown={handleTrackPointerDown}
                  onWheel={handleTrackWheel}
                  onKeyDown={handleScrollbarKeyDown}
                  className="relative h-2.5 w-full cursor-pointer rounded-full bg-muted/60 p-0.5 select-none focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <div
                    onPointerDown={handleThumbPointerDown}
                    onPointerMove={handleThumbPointerMove}
                    onPointerUp={handleThumbPointerUp}
                    onPointerCancel={handleThumbPointerUp}
                    style={{
                      width: `${thumbWidth}px`,
                      transform: `translateX(${thumbLeft}px)`,
                    }}
                    className={[
                      "h-1.5 rounded-full transition-colors cursor-grab active:cursor-grabbing",
                      isDraggingThumb
                        ? "bg-foreground/70"
                        : "bg-muted-foreground/45 hover:bg-muted-foreground/70",
                    ].join(" ")}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          {aggregated.map((b) => {
            const totalTokens = getModelTotalTokens(b);
            return (
              <div key={b.modelName} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: modelColor(b.modelName) }}
                  />
                  <span className="text-muted-foreground truncate font-mono">
                    {shortModelName(b.modelName)}
                  </span>
                  {mode === "cost" &&
                    b.missingPricing &&
                    (onConfigureModel ? (
                      <button
                        type="button"
                        onClick={() => onConfigureModel(b.modelName)}
                        className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 shrink-0 transition-colors"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>Set price</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>No price</span>
                      </span>
                    ))}
                </div>
                <span className="font-mono font-medium shrink-0 ml-2">
                  {mode === "tokens" ? formatTokens(totalTokens) : formatCost(b.cost)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
