"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
    <g transform={`translate(${x},${y + 4})`} data-tick-x={x}>
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

interface ScrollableBarsProps {
  chartWidth: number;
  chartHeight: number;
  xAxisHeight: number;
  yAxisWidth: number;
  yMax: number;
  yTicks: number[];
  chartData: ChartModelItem[];
  mode: ModelBreakdownMode;
}

const ScrollableBars = memo(function ScrollableBars({
  chartWidth,
  chartHeight,
  xAxisHeight,
  yAxisWidth,
  yMax,
  yTicks,
  chartData,
  mode,
}: ScrollableBarsProps) {
  return (
    <BarChart
      width={chartWidth}
      height={chartHeight}
      data={chartData}
      margin={{ top: 6, right: 8, left: yAxisWidth, bottom: 4 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="name"
        interval={0}
        height={xAxisHeight}
        padding={{ left: 6, right: 8 }}
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
  );
});

function normalizeWheelStep(rawDelta: number, deltaMode: number): number {
  const pxDelta =
    deltaMode === 1 ? rawDelta * 16 : deltaMode === 2 ? rawDelta * 120 : rawDelta;
  const scaled = pxDelta * 0.36;
  return Math.sign(scaled) * Math.min(Math.abs(scaled), 38);
}

const MIN_BAR_SLOT_PX = 46;
const Y_AXIS_WIDTH = 56;
const PLOT_HEIGHT = 160;
const Y_AXIS_MASK_HEIGHT = PLOT_HEIGHT + 12;

export function ModelBreakdownChart({
  breakdowns,
  mode = "cost",
  onConfigureModel,
}: ModelBreakdownProps) {
  const scrollViewportId = useId();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const tickNodesRef = useRef<Array<{ el: SVGGElement; x: number }>>([]);
  const scrollAnimRafRef = useRef<number | null>(null);
  const targetScrollRef = useRef(0);
  const floatScrollRef = useRef(0);
  const dragThumbRef = useRef<{
    startX: number;
    startScrollLeft: number;
    maxScroll: number;
    maxThumbLeft: number;
  } | null>(null);

  const [viewportWidth, setViewportWidth] = useState(0);
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

  const xAxisHeight = Math.max(76, Math.ceil(maxLineChars * 6 * 0.75 + (maxLines - 1) * 8 + 18));
  const chartHeight = PLOT_HEIGHT + xAxisHeight + 10;
  const minTotalWidth =
    chartData.length > 0 ? Y_AXIS_WIDTH + 16 + chartData.length * MIN_BAR_SLOT_PX : 0;
  const chartWidth = Math.max(viewportWidth, minTotalWidth);

  const { max: yMax, ticks: yTicks } = useMemo(() => {
    const maxValue = chartData.reduce((m, item) => Math.max(m, item.value), 0);
    return computeNiceScale(maxValue, 4);
  }, [chartData]);

  const maxScroll = Math.max(0, chartWidth - viewportWidth);
  const canScroll = viewportWidth > 0 && maxScroll > 1;
  const trackWidth = Math.max(0, viewportWidth - Y_AXIS_WIDTH);
  const thumbWidth =
    canScroll && chartWidth > 0 && trackWidth > 0
      ? Math.max(32, Math.round((viewportWidth / chartWidth) * trackWidth))
      : 0;
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);

  const updateTickVisibility = useCallback(
    (scrollLeftVal: number) => {
      if (viewportWidth <= 0) return;
      const barHalf = 16;
      const fadeSpan = 16;
      const leftEdge = scrollLeftVal + Y_AXIS_WIDTH;
      const rightEdge = scrollLeftVal + viewportWidth;
      for (const { el, x } of tickNodesRef.current) {
        const leftVisible = x + barHalf - leftEdge;
        const rightVisible = rightEdge - (x - barHalf);
        const opacity = Math.max(
          0,
          Math.min(1, Math.min(leftVisible / fadeSpan, rightVisible / fadeSpan))
        );
        el.style.opacity = opacity === 1 ? "" : opacity.toFixed(3);
      }
    },
    [viewportWidth]
  );

  const updateThumbDOM = useCallback(
    (scrollLeftVal: number) => {
      updateTickVisibility(scrollLeftVal);
      const thumb = thumbRef.current;
      const track = trackRef.current;
      if (!thumb || !track) return;
      const thumbLeft =
        maxScroll > 0 && maxThumbLeft > 0
          ? Math.max(0, Math.min(maxThumbLeft, (scrollLeftVal / maxScroll) * maxThumbLeft))
          : 0;
      thumb.style.transform = `translate3d(${thumbLeft}px, 0, 0)`;
      track.setAttribute("aria-valuenow", String(Math.round(scrollLeftVal)));
    },
    [maxScroll, maxThumbLeft, updateTickVisibility]
  );

  const stopSmoothScroll = useCallback(() => {
    if (scrollAnimRafRef.current !== null) {
      cancelAnimationFrame(scrollAnimRafRef.current);
      scrollAnimRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    const measure = () => {
      const w = vp.clientWidth;
      setViewportWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [chartData.length]);

  useEffect(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    const raf = requestAnimationFrame(() => {
      const nodes = Array.from(vp.querySelectorAll<SVGGElement>("g[data-tick-x]"));
      tickNodesRef.current = nodes
        .map((el) => ({
          el,
          x: Number(el.getAttribute("data-tick-x")),
        }))
        .filter((item) => Number.isFinite(item.x));
      updateThumbDOM(vp.scrollLeft);
    });
    return () => cancelAnimationFrame(raf);
  }, [updateThumbDOM, viewportWidth, chartWidth, chartData]);

  useEffect(() => () => stopSmoothScroll(), [stopSmoothScroll]);

  const handleViewportScroll = useCallback(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (scrollAnimRafRef.current === null) {
      floatScrollRef.current = vp.scrollLeft;
      targetScrollRef.current = vp.scrollLeft;
    }
    updateThumbDOM(vp.scrollLeft);
  }, [updateThumbDOM]);

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
        if (Math.abs(diff) <= 0.3) {
          floatScrollRef.current = targetScrollRef.current;
          el.scrollLeft = targetScrollRef.current;
          updateThumbDOM(targetScrollRef.current);
          scrollAnimRafRef.current = null;
          return;
        }
        const factor = 1 - Math.exp(-12 * dt);
        floatScrollRef.current += diff * factor;
        el.scrollLeft = floatScrollRef.current;
        updateThumbDOM(floatScrollRef.current);
        scrollAnimRafRef.current = requestAnimationFrame(tick);
      };

      scrollAnimRafRef.current = requestAnimationFrame(tick);
    },
    [updateThumbDOM]
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
    updateThumbDOM(nextScroll);
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
            <div className="relative">
              {/* Fixed Y-axis overlay ONLY covering the plot height down to $0 / 0;
                  angled model labels below $0 remain visible further left than the bars */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden bg-card select-none"
                style={{ width: Y_AXIS_WIDTH, height: Y_AXIS_MASK_HEIGHT }}
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

              {/* Scrollable plot spanning full width; bars hide behind Y-axis overlay while labels keep sliding left */}
              <div
                id={scrollViewportId}
                ref={scrollViewportRef}
                onScroll={handleViewportScroll}
                onWheel={handleViewportWheel}
                className="w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {viewportWidth > 0 ? (
                  <ScrollableBars
                    chartWidth={chartWidth}
                    chartHeight={chartHeight}
                    xAxisHeight={xAxisHeight}
                    yAxisWidth={Y_AXIS_WIDTH}
                    yMax={yMax}
                    yTicks={yTicks}
                    chartData={chartData}
                    mode={mode}
                  />
                ) : (
                  <div style={{ height: chartHeight }} />
                )}
              </div>
            </div>

            {/* Custom sleek horizontal scrollbar aligned under the plot */}
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
                  aria-valuenow={0}
                  onPointerDown={handleTrackPointerDown}
                  onWheel={handleTrackWheel}
                  onKeyDown={handleScrollbarKeyDown}
                  className="relative h-3 w-full cursor-pointer rounded-full bg-muted/60 p-0.5 select-none focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <div
                    ref={thumbRef}
                    onPointerDown={handleThumbPointerDown}
                    onPointerMove={handleThumbPointerMove}
                    onPointerUp={handleThumbPointerUp}
                    onPointerCancel={handleThumbPointerUp}
                    style={{
                      width: `${thumbWidth}px`,
                      willChange: "transform",
                    }}
                    className={[
                      "h-2 rounded-full transition-colors cursor-grab active:cursor-grabbing",
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
