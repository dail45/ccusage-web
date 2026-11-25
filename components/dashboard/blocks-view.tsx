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
import { ModelBadge } from "./model-badge";
import { OverviewStats } from "./overview-stats";
import { CostChart } from "./cost-chart";
import {
  SortableHead,
  compareTimestampsDesc,
  sortRows,
  toTimestamp,
  useTableSort,
} from "./sortable-head";
import { KPI_METRIC_META, type KpiMetricId } from "@/lib/metrics";
import { formatCost, formatTokens, shortModelName } from "@/lib/utils";
import type { BlockEntry, BlocksResponse } from "@/lib/types";

type BlockSortKey = "start" | "end" | "cost" | "tokens" | "models" | "status";

const BLOCK_SORT_GETTERS: Record<BlockSortKey, (b: BlockEntry) => string | number | null> = {
  start: (b) => toTimestamp(b.startTime),
  end: (b) => toTimestamp(b.endTime),
  cost: (b) => b.totalCost,
  tokens: (b) => b.totalTokens,
  models: (b) => (b.modelsUsed ?? []).map(shortModelName).sort().join(", "),
  status: (b) => (b.isActive ? 1 : 0),
};

export function BlocksView({
  data,
  kpiCards,
  onUpdateKpiCards,
  activeMetric = "totalCost",
  onSelectMetric,
}: {
  data: BlocksResponse;
  kpiCards: KpiMetricId[];
  onUpdateKpiCards: (next: KpiMetricId[]) => void;
  activeMetric?: KpiMetricId;
  onSelectMetric?: (metric: KpiMetricId) => void;
}) {
  const { blocks } = data;
  const { sort, toggleSort } = useTableSort<BlockSortKey>();
  const totals = data.totals ?? {
    inputTokens: blocks.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: blocks.reduce((s, d) => s + d.outputTokens, 0),
    cacheCreationTokens: blocks.reduce((s, d) => s + d.cacheCreationTokens, 0),
    cacheReadTokens: blocks.reduce((s, d) => s + d.cacheReadTokens, 0),
    totalTokens: blocks.reduce((s, d) => s + d.totalTokens, 0),
    totalCost: blocks.reduce((s, d) => s + d.totalCost, 0),
  };

  const sortedBlocks = useMemo(
    () =>
      sortRows(blocks, sort, BLOCK_SORT_GETTERS, (a, b) =>
        compareTimestampsDesc(a.startTime, b.startTime)
      ),
    [blocks, sort]
  );

  const activeMetricMeta = KPI_METRIC_META[activeMetric];
  const chartData = blocks.map((b, i) => ({
    label: b.startTime
      ? new Date(b.startTime).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) +
        " " +
        new Date(b.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : `Block ${i + 1}`,
    value: activeMetricMeta.getSeriesValue(b),
  }));

  return (
    <div className="space-y-4">
      <OverviewStats
        totals={totals}
        label={`${blocks.length} billing blocks`}
        itemCount={blocks.length}
        unitLabel="block"
        kpiCards={kpiCards}
        onUpdateKpiCards={onUpdateKpiCards}
        activeMetric={activeMetric}
        onSelectMetric={onSelectMetric}
      />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">
            {activeMetricMeta.chartTitlePrefix} per 5-Hour Block
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <CostChart data={chartData} metric={activeMetric} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Billing Blocks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="start" label="Start" sort={sort} onSort={toggleSort} />
                <SortableHead column="end" label="End" sort={sort} onSort={toggleSort} />
                <SortableHead column="cost" label="Cost" sort={sort} onSort={toggleSort} align="right" />
                <SortableHead
                  column="tokens"
                  label="Tokens"
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
                <SortableHead
                  column="status"
                  label="Status"
                  sort={sort}
                  onSort={toggleSort}
                  className="hidden lg:table-cell"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBlocks.map((b, i) => (
                <TableRow
                  key={b.startTime ? `${b.startTime}-${b.endTime}` : i}
                  className={b.isActive ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {b.startTime ? new Date(b.startTime).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {b.isActive ? (
                      <span className="text-primary">active</span>
                    ) : b.endTime ? (
                      new Date(b.endTime).toLocaleTimeString()
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">
                    {formatCost(b.totalCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground text-sm hidden sm:table-cell">
                    {formatTokens(b.totalTokens)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {b.modelsUsed?.map((m) => (
                        <ModelBadge key={m} model={m} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {b.isActive && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                        Active
                      </Badge>
                    )}
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
