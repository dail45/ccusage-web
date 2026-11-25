"use client";

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
import { KPI_METRIC_META, type KpiMetricId } from "@/lib/metrics";

interface ChartDataPoint {
  label: string;
  value: number;
}

interface CostChartProps {
  data: ChartDataPoint[];
  metric?: KpiMetricId;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  metric: KpiMetricId;
}

function CustomTooltip({ active, payload, label, metric }: CustomTooltipProps) {
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

export function CostChart({ data, metric = "totalCost" }: CostChartProps) {
  const meta = KPI_METRIC_META[metric];
  const avgLine =
    metric === "avgCost" && data.length > 0
      ? data.reduce((s, d) => s + d.value, 0) / data.length
      : null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="blocksMetricGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={meta.accentColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={meta.accentColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={meta.unit === "percent" ? [0, 100] : [0, "auto"]}
          tickFormatter={(v) => meta.formatAxisTick(Number(v))}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip metric={metric} />} />
        {avgLine !== null && (
          <ReferenceLine
            y={avgLine}
            stroke={meta.accentColor}
            strokeDasharray="4 4"
            strokeOpacity={0.65}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={meta.accentColor}
          strokeWidth={2}
          fill="url(#blocksMetricGradient)"
          dot={false}
          activeDot={{ r: 4, fill: meta.accentColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
