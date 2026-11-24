"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CostChart } from "./cost-chart";
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
import { formatCost, formatTokens, shortModelName, modelColor, aggregateModelBreakdowns } from "@/lib/utils";
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
  const chartData = daily.map((d) => ({ label: d.date.slice(5), cost: d.totalCost }));
  const allBreakdowns = daily.flatMap((d) => d.modelBreakdowns);
  const aggregatedTotals = totals ?? {
    inputTokens: daily.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: daily.reduce((s, d) => s + d.outputTokens, 0),
    cacheCreationTokens: daily.reduce((s, d) => s + d.cacheCreationTokens, 0),
    cacheReadTokens: daily.reduce((s, d) => s + d.cacheReadTokens, 0),
    totalTokens: daily.reduce((s, d) => s + d.totalTokens, 0),
    totalCost: daily.reduce((s, d) => s + d.totalCost, 0),
  };

  const sortedDaily = useMemo(
    () => sortRows(daily, sort, DAILY_SORT_GETTERS, (a, b) => compareTimestampsDesc(a.date, b.date)),
    [daily, sort]
  );

  return (
    <div className="space-y-4">
      <OverviewStats totals={aggregatedTotals} label={`${daily.length} days shown`} />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Daily Spend</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <CostChart data={chartData} />
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
              {sortedDaily.map((day) => (
                <TableRow key={day.date}>
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
                        <Badge
                          key={m}
                          variant="secondary"
                          className="text-xs font-mono px-1.5 py-0"
                          style={{ borderColor: modelColor(m) }}
                        >
                          {shortModelName(m)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
