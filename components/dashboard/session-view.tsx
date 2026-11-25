"use client";

import { useState, useMemo } from "react";
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
import {
  SortableHead,
  compareTimestampsDesc,
  sortRows,
  toTimestamp,
  useTableSort,
} from "./sortable-head";
import type { KpiMetricId } from "@/lib/metrics";
import { formatCost, formatTokens, shortModelName } from "@/lib/utils";
import type { SessionEntry, SessionResponse } from "@/lib/types";

type FilterPeriod = "1D" | "7D" | "30D" | "All";
type SessionSortKey = "started" | "agent" | "cost" | "tokens" | "project" | "models";

const FILTERS: FilterPeriod[] = ["1D", "7D", "30D", "All"];

function getProjectName(projectPath?: string): string {
  if (!projectPath) return "";
  return projectPath.split(/[/\\]/).filter(Boolean).pop() ?? projectPath;
}

const SESSION_SORT_GETTERS: Record<SessionSortKey, (s: SessionEntry) => string | number | null> = {
  started: (s) => toTimestamp(s.startTime),
  agent: (s) => s.agent ?? "",
  cost: (s) => s.totalCost,
  tokens: (s) => s.totalTokens,
  project: (s) => getProjectName(s.projectPath),
  models: (s) => (s.modelsUsed ?? []).map(shortModelName).sort().join(", "),
};

function startOfPeriod(period: FilterPeriod): Date | null {
  if (period === "All") return null;
  const now = new Date();
  if (period === "1D") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = period === "7D" ? 7 : 30;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

export function SessionView({
  data,
  kpiCards,
  onUpdateKpiCards,
  onConfigureModel,
}: {
  data: SessionResponse;
  kpiCards: KpiMetricId[];
  onUpdateKpiCards: (next: KpiMetricId[]) => void;
  onConfigureModel?: (modelName: string) => void;
}) {
  const [filter, setFilter] = useState<FilterPeriod>("1D");
  const { sort, toggleSort } = useTableSort<SessionSortKey>();

  const filteredSessions = useMemo(() => {
    const cutoff = startOfPeriod(filter);
    const filtered = cutoff
      ? data.sessions.filter((s) => s.startTime && new Date(s.startTime) >= cutoff)
      : data.sessions;
    return sortRows(filtered, sort, SESSION_SORT_GETTERS, (a, b) =>
      compareTimestampsDesc(a.startTime, b.startTime)
    );
  }, [data.sessions, filter, sort]);

  const totals = useMemo(() => ({
    inputTokens: filteredSessions.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: filteredSessions.reduce((s, d) => s + d.outputTokens, 0),
    cacheCreationTokens: filteredSessions.reduce((s, d) => s + d.cacheCreationTokens, 0),
    cacheReadTokens: filteredSessions.reduce((s, d) => s + d.cacheReadTokens, 0),
    totalTokens: filteredSessions.reduce((s, d) => s + d.totalTokens, 0),
    totalCost: filteredSessions.reduce((s, d) => s + d.totalCost, 0),
  }), [filteredSessions]);

  return (
    <div className="space-y-4">
      <OverviewStats
        totals={totals}
        label={`${filteredSessions.length} sessions`}
        itemCount={filteredSessions.length}
        unitLabel="session"
        kpiCards={kpiCards}
        onUpdateKpiCards={onUpdateKpiCards}
      />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    "px-2.5 py-0.5 rounded text-xs font-medium transition-colors",
                    filter === f
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  ].join(" ")}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No sessions in this period
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead column="started" label="Started" sort={sort} onSort={toggleSort} />
                  <SortableHead column="agent" label="Agent" sort={sort} onSort={toggleSort} />
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
                    column="project"
                    label="Project"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableHead
                    column="models"
                    label="Models"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden lg:table-cell"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((s, idx) => {
                  const missingModels = new Set(
                    (s.modelBreakdowns ?? []).filter((b) => b.missingPricing).map((b) => b.modelName)
                  );
                  return (
                  <TableRow key={s.sessionId ? `${s.agent ?? ""}:${s.sessionId}` : idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.startTime ? new Date(s.startTime).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {s.agent ? (
                        <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                          {s.agent}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-sm">
                      {formatCost(s.totalCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground text-sm hidden sm:table-cell">
                      {formatTokens(s.totalTokens)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px]">
                      {s.projectPath && (
                        <span className="text-xs text-muted-foreground truncate block font-mono">
                          {getProjectName(s.projectPath)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {s.modelsUsed?.map((m) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
