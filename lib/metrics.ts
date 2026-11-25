import { formatCost, formatTokens } from "./utils";
import type { Totals } from "./types";

export type KpiMetricId =
  | "totalCost"
  | "totalTokens"
  | "cacheReadTokens"
  | "cacheCreationTokens"
  | "inputTokens"
  | "outputTokens"
  | "cacheHitRate"
  | "avgCost";

export const ALL_KPI_METRICS: readonly KpiMetricId[] = [
  "totalCost",
  "totalTokens",
  "cacheReadTokens",
  "cacheHitRate",
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "avgCost",
] as const;

export const DEFAULT_KPI_CARDS: KpiMetricId[] = [
  "totalCost",
  "totalTokens",
  "cacheReadTokens",
  "cacheHitRate",
  "inputTokens",
  "outputTokens",
  "cacheCreationTokens",
  "avgCost",
];

export interface KpiMetricMeta {
  id: KpiMetricId;
  title: string;
  shortLabel: string;
  accentColor: string;
  chartTitlePrefix: string;
  unit: "currency" | "tokens" | "percent";
  formatKpiValue: (totals: Totals, itemCount?: number) => string;
  getKpiSub: (totals: Totals, label: string, itemCount?: number, unitLabel?: string) => string;
  getSeriesValue: (entry: Totals) => number;
  formatAxisTick: (value: number) => string;
  formatTooltipValue: (value: number) => string;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function formatAxisTokens(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return Math.round(value).toString();
}

function formatAxisCurrency(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value === 0) return "$0";
  return `$${value.toFixed(2)}`;
}

export const KPI_METRIC_META: Record<KpiMetricId, KpiMetricMeta> = {
  totalCost: {
    id: "totalCost",
    title: "Total Cost",
    shortLabel: "Cost",
    accentColor: "#3b82f6",
    chartTitlePrefix: "Spend",
    unit: "currency",
    formatKpiValue: (t) => formatCost(t.totalCost),
    getKpiSub: (_t, label) => label,
    getSeriesValue: (e) => e.totalCost,
    formatAxisTick: formatAxisCurrency,
    formatTooltipValue: formatCost,
  },
  totalTokens: {
    id: "totalTokens",
    title: "Total Tokens",
    shortLabel: "Total Tokens",
    accentColor: "#06b6d4",
    chartTitlePrefix: "Total Tokens",
    unit: "tokens",
    formatKpiValue: (t) => formatTokens(t.totalTokens ?? 0),
    getKpiSub: () => "input + output + cache",
    getSeriesValue: (e) => e.totalTokens ?? 0,
    formatAxisTick: formatAxisTokens,
    formatTooltipValue: (v) => `${formatTokens(Math.round(v))} tokens`,
  },
  cacheReadTokens: {
    id: "cacheReadTokens",
    title: "Cache Read",
    shortLabel: "Cache Read",
    accentColor: "#10b981",
    chartTitlePrefix: "Cache Read Tokens",
    unit: "tokens",
    formatKpiValue: (t) => formatTokens(t.cacheReadTokens),
    getKpiSub: (t) => `${pct(t.cacheReadTokens, t.totalTokens).toFixed(1)}% of total`,
    getSeriesValue: (e) => e.cacheReadTokens,
    formatAxisTick: formatAxisTokens,
    formatTooltipValue: (v) => `${formatTokens(Math.round(v))} cache read`,
  },
  cacheCreationTokens: {
    id: "cacheCreationTokens",
    title: "Cache Write",
    shortLabel: "Cache Write",
    accentColor: "#f59e0b",
    chartTitlePrefix: "Cache Write Tokens",
    unit: "tokens",
    formatKpiValue: (t) => formatTokens(t.cacheCreationTokens),
    getKpiSub: (t) => `${pct(t.cacheCreationTokens, t.totalTokens).toFixed(1)}% of total`,
    getSeriesValue: (e) => e.cacheCreationTokens,
    formatAxisTick: formatAxisTokens,
    formatTooltipValue: (v) => `${formatTokens(Math.round(v))} cache write`,
  },
  inputTokens: {
    id: "inputTokens",
    title: "Input Tokens",
    shortLabel: "Input",
    accentColor: "#8b5cf6",
    chartTitlePrefix: "Input Tokens",
    unit: "tokens",
    formatKpiValue: (t) => formatTokens(t.inputTokens),
    getKpiSub: (t) => `${pct(t.inputTokens, t.totalTokens).toFixed(1)}% of total`,
    getSeriesValue: (e) => e.inputTokens,
    formatAxisTick: formatAxisTokens,
    formatTooltipValue: (v) => `${formatTokens(Math.round(v))} input`,
  },
  outputTokens: {
    id: "outputTokens",
    title: "Output Tokens",
    shortLabel: "Output",
    accentColor: "#6366f1",
    chartTitlePrefix: "Output Tokens",
    unit: "tokens",
    formatKpiValue: (t) => formatTokens(t.outputTokens),
    getKpiSub: (t) => `${pct(t.outputTokens, t.totalTokens).toFixed(1)}% of total`,
    getSeriesValue: (e) => e.outputTokens,
    formatAxisTick: formatAxisTokens,
    formatTooltipValue: (v) => `${formatTokens(Math.round(v))} output`,
  },
  cacheHitRate: {
    id: "cacheHitRate",
    title: "Cache Hit %",
    shortLabel: "Cache Hit %",
    accentColor: "#14b8a6",
    chartTitlePrefix: "Cache Hit Rate",
    unit: "percent",
    formatKpiValue: (t) => `${pct(t.cacheReadTokens, t.totalTokens).toFixed(1)}%`,
    getKpiSub: (t) => `${formatTokens(t.cacheReadTokens)} cached`,
    getSeriesValue: (e) => pct(e.cacheReadTokens, e.totalTokens),
    formatAxisTick: (v) => `${Math.round(v)}%`,
    formatTooltipValue: (v) => `${v.toFixed(1)}% cache hit`,
  },
  avgCost: {
    id: "avgCost",
    title: "Avg Cost",
    shortLabel: "Avg Cost",
    accentColor: "#3b82f6",
    chartTitlePrefix: "Spend (with Avg)",
    unit: "currency",
    formatKpiValue: (t, count = 1) => formatCost(t.totalCost / Math.max(count, 1)),
    getKpiSub: (_t, _label, count = 1, unitLabel = "period") =>
      `avg across ${count} ${count === 1 ? unitLabel : `${unitLabel}s`}`,
    getSeriesValue: (e) => e.totalCost,
    formatAxisTick: formatAxisCurrency,
    formatTooltipValue: formatCost,
  },
};

export function isValidKpiMetric(id: string): id is KpiMetricId {
  return id in KPI_METRIC_META;
}
