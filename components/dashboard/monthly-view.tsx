"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { KPI_METRIC_META, type KpiMetricId } from "@/lib/metrics";
import { DateRangeFilter } from "./date-range-filter";
import { ModelBreakdownChart } from "./model-breakdown";
import { ModelFilter } from "./model-filter";
import { TokenBreakdown } from "./token-breakdown";
import { OverviewStats } from "./overview-stats";
import {
  SortableHead,
  compareTimestampsDesc,
  sortRows,
  toTimestamp,
  useTableSort,
} from "./sortable-head";
import {
  aggregateModelBreakdowns,
  filterEntryByModels,
  formatCost,
  formatTokens,
  modelColor,
  shortModelName,
  sumUsageTotals,
} from "@/lib/utils";
import type { MonthlyEntry, MonthlyResponse } from "@/lib/types";

type MonthlySortKey = "month" | "cost" | "tokens" | "cacheRead" | "topModel";

function getTopModel(entry: MonthlyEntry) {
  return [...(entry.modelBreakdowns ?? [])].sort((a, b) => b.cost - a.cost)[0];
}

const MONTHLY_SORT_GETTERS: Record<MonthlySortKey, (m: MonthlyEntry) => string | number | null> = {
  month: (m) => toTimestamp(m.month) ?? m.month,
  cost: (m) => m.totalCost,
  tokens: (m) => m.totalTokens,
  cacheRead: (m) => m.cacheReadTokens,
  topModel: (m) => {
    const top = getTopModel(m);
    return top ? shortModelName(top.modelName) : "";
  },
};

interface MonthlyTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  metric: KpiMetricId;
}

function CustomTooltip({ active, payload, label, metric }: MonthlyTooltipProps) {
  if (!active || !payload?.length) return null;
  const meta = KPI_METRIC_META[metric];
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium font-mono text-xs">{label}</p>
      <p className="font-mono font-medium" style={{ color: meta.accentColor }}>
        {meta.formatTooltipValue(payload[0].value ?? 0)}
      </p>
    </div>
  );
}

export function MonthlyView({
  data,
  kpiCards,
  onUpdateKpiCards,
  excludedModels = [],
  onChangeExcludedModels,
  activeMetric = "totalCost",
  onSelectMetric,
  onConfigureModel,
}: {
  data: MonthlyResponse;
  kpiCards: KpiMetricId[];
  onUpdateKpiCards: (next: KpiMetricId[]) => void;
  excludedModels?: string[];
  onChangeExcludedModels?: (next: string[]) => void;
  activeMetric?: KpiMetricId;
  onSelectMetric?: (metric: KpiMetricId) => void;
  onConfigureModel?: (modelName: string) => void;
}) {
  const { monthly, totals } = data;
  const { sort, toggleSort } = useTableSort<MonthlySortKey>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const chronologicalMonths = useMemo(
    () => [...monthly].sort((a, b) => a.month.localeCompare(b.month)),
    [monthly]
  );

  const minMonth = chronologicalMonths[0]?.month;
  const maxMonth = chronologicalMonths[chronologicalMonths.length - 1]?.month;

  const filteredMonthly = useMemo(
    () =>
      chronologicalMonths.filter((m) => {
        if (from && m.month < from) return false;
        if (to && m.month > to) return false;
        return true;
      }),
    [chronologicalMonths, from, to]
  );

  const allBreakdowns = useMemo(
    () => filteredMonthly.flatMap((m) => m.modelBreakdowns),
    [filteredMonthly]
  );

  const aggregatedBreakdowns = useMemo(
    () => aggregateModelBreakdowns(allBreakdowns),
    [allBreakdowns]
  );

  const excludedSet = useMemo(() => new Set(excludedModels), [excludedModels]);

  const hasModelFilter = useMemo(
    () => excludedSet.size > 0 && aggregatedBreakdowns.some((b) => excludedSet.has(b.modelName)),
    [aggregatedBreakdowns, excludedSet]
  );

  const modelFilteredMonthly = useMemo(
    () =>
      excludedSet.size === 0
        ? filteredMonthly
        : filteredMonthly.map((m) => filterEntryByModels(m, excludedSet)),
    [filteredMonthly, excludedSet]
  );

  const hasDateFilter = Boolean(from || to);
  const hasDataFilter = hasDateFilter || hasModelFilter;

  const aggregatedTotals = useMemo(
    () => (!hasDataFilter && totals ? totals : sumUsageTotals(modelFilteredMonthly)),
    [hasDataFilter, totals, modelFilteredMonthly]
  );

  const filteredBreakdowns = useMemo(
    () => aggregatedBreakdowns.filter((b) => !excludedSet.has(b.modelName)),
    [aggregatedBreakdowns, excludedSet]
  );

  const activeMetricMeta = KPI_METRIC_META[activeMetric];
  const monthlyAvgCostLine =
    activeMetric === "avgCost" && modelFilteredMonthly.length > 0
      ? modelFilteredMonthly.reduce((s, m) => s + m.totalCost, 0) / modelFilteredMonthly.length
      : null;

  const tableRows = useMemo(
    () =>
      hasModelFilter
        ? modelFilteredMonthly.filter(
            (m) => m.modelBreakdowns.length > 0 || m.modelsUsed.length > 0
          )
        : modelFilteredMonthly,
    [hasModelFilter, modelFilteredMonthly]
  );

  const sortedMonthly = useMemo(
    () =>
      sortRows(tableRows, sort, MONTHLY_SORT_GETTERS, (a, b) =>
        compareTimestampsDesc(a.month, b.month)
      ),
    [tableRows, sort]
  );

  function handleFromChange(nextFrom: string) {
    setFrom(nextFrom);
    if (to && nextFrom && nextFrom > to) {
      setTo(nextFrom);
    }
  }

  function handleToChange(nextTo: string) {
    setTo(nextTo);
    if (from && nextTo && nextTo < from) {
      setFrom(nextTo);
    }
  }

  function handleReset() {
    setFrom("");
    setTo("");
  }

  const modelSuffix = hasModelFilter
    ? ` · ${filteredBreakdowns.length}/${aggregatedBreakdowns.length} models`
    : "";

  const statsLabel =
    (hasDateFilter
      ? `${filteredMonthly.length} months (${from || minMonth || "…"} – ${to || maxMonth || "…"})`
      : `${monthly.length} months shown`) + modelSuffix;

  return (
    <div className="space-y-4">
      <DateRangeFilter
        type="month"
        from={from}
        to={to}
        min={minMonth}
        max={maxMonth}
        onFromChange={handleFromChange}
        onToChange={handleToChange}
        onReset={handleReset}
        hasActiveFilter={hasDateFilter}
      />

      <OverviewStats
        totals={aggregatedTotals}
        label={statsLabel}
        itemCount={modelFilteredMonthly.length}
        unitLabel="month"
        kpiCards={kpiCards}
        onUpdateKpiCards={onUpdateKpiCards}
        activeMetric={activeMetric}
        onSelectMetric={onSelectMetric}
      />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">
            Monthly {activeMetricMeta.chartTitlePrefix}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {modelFilteredMonthly.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              No monthly data in selected range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={modelFilteredMonthly.map((m) => ({
                  label: m.month,
                  value: activeMetricMeta.getSeriesValue(m),
                }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={activeMetricMeta.unit === "percent" ? [0, 100] : [0, "auto"]}
                  tickFormatter={(v) => activeMetricMeta.formatAxisTick(Number(v))}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip content={<CustomTooltip metric={activeMetric} />} />
                {monthlyAvgCostLine !== null && (
                  <ReferenceLine
                    y={monthlyAvgCostLine}
                    stroke={activeMetricMeta.accentColor}
                    strokeDasharray="4 4"
                    strokeOpacity={0.65}
                  />
                )}
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {modelFilteredMonthly.map((m) => (
                    <Cell key={m.month} fill={activeMetricMeta.accentColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-stretch">
        <ModelBreakdownChart
          breakdowns={filteredBreakdowns}
          mode="cost"
          onConfigureModel={onConfigureModel}
        />
        <ModelBreakdownChart
          breakdowns={filteredBreakdowns}
          mode="tokens"
          headerAction={
            onChangeExcludedModels ? (
              <ModelFilter
                models={aggregatedBreakdowns}
                excludedModels={excludedModels}
                onChangeExcluded={onChangeExcludedModels}
              />
            ) : undefined
          }
        />
      </div>

      <TokenBreakdown totals={aggregatedTotals} />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="month" label="Month" sort={sort} onSort={toggleSort} />
                <SortableHead column="cost" label="Cost" sort={sort} onSort={toggleSort} align="right" />
                <SortableHead column="tokens" label="Tokens" sort={sort} onSort={toggleSort} align="right" />
                <SortableHead
                  column="cacheRead"
                  label="Cache Read"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                  className="hidden sm:table-cell"
                />
                <SortableHead
                  column="topModel"
                  label="Top Model"
                  sort={sort}
                  onSort={toggleSort}
                  className="hidden md:table-cell"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMonthly.map((m) => {
                const topModel = getTopModel(m);
                return (
                  <TableRow key={m.month}>
                    <TableCell className="font-mono text-sm">{m.month}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCost(m.totalCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm">
                      {formatTokens(m.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm hidden sm:table-cell">
                      {formatTokens(m.cacheReadTokens)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {topModel && (
                        <span
                          className="text-xs font-mono"
                          style={{ color: modelColor(topModel.modelName) }}
                        >
                          {shortModelName(topModel.modelName)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
