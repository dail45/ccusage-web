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
  cn,
  formatCost,
  formatTokens,
  shortModelName,
  sumUsageTotals,
} from "@/lib/utils";
import type { DailyEntry, DailyResponse } from "@/lib/types";

type DailySortKey = "date" | "cost" | "tokens" | "cacheRead" | "models";

const DAILY_SORT_GETTERS: Record<DailySortKey, (d: DailyEntry) => string | number | null> = {
  date: (d) => toTimestamp(d.date) ?? d.date,
  cost: (d) => d.totalCost,
  tokens: (d) => d.totalTokens,
  cacheRead: (d) => d.cacheReadTokens,
  models: (d) => d.modelsUsed.map(shortModelName).sort().join(", "),
};

export function DailyView({ data }: { data: DailyResponse }) {
  const { daily, totals } = data;
  const { sort, toggleSort } = useTableSort<DailySortKey>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const chronologicalDays = useMemo(
    () => [...daily].sort((a, b) => a.date.localeCompare(b.date)),
    [daily]
  );

  const minDate = chronologicalDays[0]?.date;
  const maxDate = chronologicalDays[chronologicalDays.length - 1]?.date;

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

  const statsDays = useMemo(
    () => (selectedDayEntry ? [selectedDayEntry] : filteredDays),
    [selectedDayEntry, filteredDays]
  );

  const hasRangeFilter = Boolean(from || to);
  const hasActiveFilter = hasRangeFilter || Boolean(selectedDayEntry);

  const aggregatedTotals = useMemo(
    () => (!hasActiveFilter && totals ? totals : sumUsageTotals(statsDays)),
    [hasActiveFilter, totals, statsDays]
  );

  const allBreakdowns = useMemo(
    () => statsDays.flatMap((d) => d.modelBreakdowns),
    [statsDays]
  );

  const sortedDaily = useMemo(
    () =>
      sortRows(filteredDays, sort, DAILY_SORT_GETTERS, (a, b) =>
        compareTimestampsDesc(a.date, b.date)
      ),
    [filteredDays, sort]
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

  function handleReset() {
    setFrom("");
    setTo("");
    setSelectedDate(null);
  }

  const statsLabel = selectedDayEntry
    ? `${selectedDayEntry.date} (selected day)`
    : hasRangeFilter
      ? `${filteredDays.length} days (${from || minDate || "…"} – ${to || maxDate || "…"})`
      : `${daily.length} days shown`;

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
        hasActiveFilter={hasActiveFilter}
        selectedLabel={selectedDayEntry?.date ?? null}
        onClearSelected={() => setSelectedDate(null)}
      />

      <OverviewStats totals={aggregatedTotals} label={statsLabel} />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Daily Spend</CardTitle>
            <span className="text-[11px] text-muted-foreground">
              Click a day for details · Drag edges to zoom
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <DailySpendChart
            allDays={chronologicalDays}
            visibleDays={filteredDays}
            selectedDate={selectedDayEntry?.date ?? null}
            onSelectDate={handleSelectDate}
            onRangeCommit={handleRangeCommit}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModelBreakdownChart breakdowns={aggregateModelBreakdowns(allBreakdowns)} />
        <TokenBreakdown totals={aggregatedTotals} />
      </div>

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
                          <ModelBadge key={m} model={m} />
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
