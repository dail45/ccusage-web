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
import { DailySpendChart } from "./daily-spend-chart";
import { DateRangeFilter } from "./date-range-filter";
import { ModelBadge } from "./model-badge";
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
import { KPI_METRIC_META, type KpiMetricId } from "@/lib/metrics";
import {
  DAILY_RANGE_OPTIONS,
  detectActivePreset,
  getPresetDateRange,
} from "@/lib/preferences";
import {
  aggregateModelBreakdowns,
  cn,
  filterEntryByModels,
  formatCost,
  formatTokens,
  shortModelName,
  sumUsageTotals,
} from "@/lib/utils";
import type { DailyEntry, DailyRangePreset, DailyResponse } from "@/lib/types";

type DailySortKey = "date" | "cost" | "tokens" | "cacheRead" | "models";

const DAILY_SORT_GETTERS: Record<DailySortKey, (d: DailyEntry) => string | number | null> = {
  date: (d) => toTimestamp(d.date) ?? d.date,
  cost: (d) => d.totalCost,
  tokens: (d) => d.totalTokens,
  cacheRead: (d) => d.cacheReadTokens,
  models: (d) => d.modelsUsed.map(shortModelName).sort().join(", "),
};

export function DailyView({
  data,
  defaultRange = "all",
  kpiCards,
  onUpdateKpiCards,
  excludedModels = [],
  onChangeExcludedModels,
  activeMetric = "totalCost",
  onSelectMetric,
  onConfigureModel,
}: {
  data: DailyResponse;
  defaultRange?: DailyRangePreset;
  kpiCards: KpiMetricId[];
  onUpdateKpiCards: (next: KpiMetricId[]) => void;
  excludedModels?: string[];
  onChangeExcludedModels?: (next: string[]) => void;
  activeMetric?: KpiMetricId;
  onSelectMetric?: (metric: KpiMetricId) => void;
  onConfigureModel?: (modelName: string) => void;
}) {
  const { daily, totals } = data;
  const { sort, toggleSort } = useTableSort<DailySortKey>();

  const chronologicalDays = useMemo(
    () => [...daily].sort((a, b) => a.date.localeCompare(b.date)),
    [daily]
  );

  const minDate = chronologicalDays[0]?.date;
  const maxDate = chronologicalDays[chronologicalDays.length - 1]?.date;

  const [from, setFrom] = useState(() => getPresetDateRange(defaultRange, maxDate).from);
  const [to, setTo] = useState(() => getPresetDateRange(defaultRange, maxDate).to);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const activePreset = useMemo(
    () => detectActivePreset(from, to, maxDate),
    [from, to, maxDate]
  );

  const filteredDays = useMemo(
    () =>
      chronologicalDays.filter((d) => {
        if (from && d.date < from) return false;
        if (to && d.date > to) return false;
        return true;
      }),
    [chronologicalDays, from, to]
  );

  const selectedDayEntry = useMemo(
    () => (selectedDate ? filteredDays.find((d) => d.date === selectedDate) ?? null : null),
    [filteredDays, selectedDate]
  );

  const unfilteredStatsDays = useMemo(
    () => (selectedDayEntry ? [selectedDayEntry] : filteredDays),
    [selectedDayEntry, filteredDays]
  );

  const allBreakdowns = useMemo(
    () => unfilteredStatsDays.flatMap((d) => d.modelBreakdowns),
    [unfilteredStatsDays]
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

  const modelFilteredAllDays = useMemo(
    () =>
      excludedSet.size === 0
        ? chronologicalDays
        : chronologicalDays.map((d) => filterEntryByModels(d, excludedSet)),
    [chronologicalDays, excludedSet]
  );

  const modelFilteredRangeDays = useMemo(
    () =>
      excludedSet.size === 0
        ? filteredDays
        : filteredDays.map((d) => filterEntryByModels(d, excludedSet)),
    [filteredDays, excludedSet]
  );

  const statsDays = useMemo(
    () =>
      selectedDayEntry
        ? [filterEntryByModels(selectedDayEntry, excludedSet)]
        : modelFilteredRangeDays,
    [selectedDayEntry, excludedSet, modelFilteredRangeDays]
  );

  const hasRangeFilter = Boolean(from || to);
  const hasDateFilter = hasRangeFilter || Boolean(selectedDayEntry);
  const hasDataFilter = hasDateFilter || hasModelFilter;

  const aggregatedTotals = useMemo(
    () => (!hasDataFilter && totals ? totals : sumUsageTotals(statsDays)),
    [hasDataFilter, totals, statsDays]
  );

  const filteredBreakdowns = useMemo(
    () => aggregatedBreakdowns.filter((b) => !excludedSet.has(b.modelName)),
    [aggregatedBreakdowns, excludedSet]
  );

  const activeMetricMeta = KPI_METRIC_META[activeMetric];

  const tableRows = useMemo(
    () =>
      hasModelFilter
        ? modelFilteredRangeDays.filter(
            (d) => d.modelBreakdowns.length > 0 || d.modelsUsed.length > 0
          )
        : modelFilteredRangeDays,
    [hasModelFilter, modelFilteredRangeDays]
  );

  const sortedDaily = useMemo(
    () =>
      sortRows(tableRows, sort, DAILY_SORT_GETTERS, (a, b) =>
        compareTimestampsDesc(a.date, b.date)
      ),
    [tableRows, sort]
  );

  function handleFromChange(nextFrom: string) {
    setFrom(nextFrom);
    if (to && nextFrom && nextFrom > to) {
      setTo(nextFrom);
    }
    if (selectedDate && nextFrom && selectedDate < nextFrom) {
      setSelectedDate(null);
    }
  }

  function handleToChange(nextTo: string) {
    setTo(nextTo);
    if (from && nextTo && nextTo < from) {
      setFrom(nextTo);
    }
    if (selectedDate && nextTo && selectedDate > nextTo) {
      setSelectedDate(null);
    }
  }

  function handleRangeCommit(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (selectedDate) {
      if ((nextFrom && selectedDate < nextFrom) || (nextTo && selectedDate > nextTo)) {
        setSelectedDate(null);
      }
    }
  }

  function handleSelectDate(date: string) {
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  function handleSelectPreset(presetValue: string) {
    const next = getPresetDateRange(presetValue as DailyRangePreset, maxDate);
    setFrom(next.from);
    setTo(next.to);
    if (selectedDate && next.from && (selectedDate < next.from || (next.to && selectedDate > next.to))) {
      setSelectedDate(null);
    }
  }

  function handleReset() {
    setFrom("");
    setTo("");
    setSelectedDate(null);
  }

  const modelSuffix = hasModelFilter
    ? ` · ${filteredBreakdowns.length}/${aggregatedBreakdowns.length} models`
    : "";

  const statsLabel =
    (selectedDayEntry
      ? `${selectedDayEntry.date} (selected day)`
      : hasRangeFilter
        ? `${filteredDays.length} days (${from || minDate || "…"} – ${to || maxDate || "…"})`
        : `${daily.length} days shown`) + modelSuffix;

  return (
    <div className="space-y-4">
      <DateRangeFilter
        type="date"
        from={from}
        to={to}
        min={minDate}
        max={maxDate}
        onFromChange={handleFromChange}
        onToChange={handleToChange}
        onReset={handleReset}
        hasActiveFilter={hasDateFilter}
        selectedLabel={selectedDayEntry?.date ?? null}
        onClearSelected={() => setSelectedDate(null)}
        presets={DAILY_RANGE_OPTIONS}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
      />

      <OverviewStats
        totals={aggregatedTotals}
        label={statsLabel}
        itemCount={statsDays.length}
        unitLabel="day"
        kpiCards={kpiCards}
        onUpdateKpiCards={onUpdateKpiCards}
        activeMetric={activeMetric}
        onSelectMetric={onSelectMetric}
      />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">
              Daily {activeMetricMeta.chartTitlePrefix}
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              Click a day for details · Drag edges to zoom
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <DailySpendChart
            allDays={modelFilteredAllDays}
            visibleDays={modelFilteredRangeDays}
            selectedDate={selectedDayEntry?.date ?? null}
            metric={activeMetric}
            onSelectDate={handleSelectDate}
            onRangeCommit={handleRangeCommit}
          />
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
          <CardTitle className="text-sm font-medium">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="date" label="Date" sort={sort} onSort={toggleSort} />
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
                  column="models"
                  label="Models"
                  sort={sort}
                  onSort={toggleSort}
                  className="hidden md:table-cell"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDaily.map((day) => {
                const isSelected = selectedDayEntry?.date === day.date;
                const missingModels = new Set(
                  day.modelBreakdowns.filter((b) => b.missingPricing).map((b) => b.modelName)
                );
                return (
                  <TableRow
                    key={day.date}
                    onClick={() => handleSelectDate(day.date)}
                    className={cn("cursor-pointer", isSelected && "bg-primary/10 hover:bg-primary/15")}
                  >
                    <TableCell className="font-mono text-sm">{day.date}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCost(day.totalCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm">
                      {formatTokens(day.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm hidden sm:table-cell">
                      {formatTokens(day.cacheReadTokens)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {day.modelsUsed.map((m) => (
                          <ModelBadge
                            key={m}
                            model={m}
                            missingPricing={missingModels.has(m)}
                            onFixPricing={onConfigureModel}
                          />
                        ))}
                      </div>
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
