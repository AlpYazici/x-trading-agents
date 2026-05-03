"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost, type Snapshot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const RANGES = [
  { label: "1H", period: "1d",  interval: "5m"  },
  { label: "1D", period: "2d",  interval: "15m" },
  { label: "1W", period: "5d",  interval: "1h"  },
  { label: "1M", period: "1mo", interval: "1d"  },
  { label: "3M", period: "3mo", interval: "1d"  },
  { label: "1Y", period: "1y",  interval: "1d"  },
];

export function PortfolioTimeSeries() {
  const qc = useQueryClient();
  const [rangeIdx, setRangeIdx] = useState(3);  // default 1M
  const range = RANGES[rangeIdx];

  const { data, isLoading } = useQuery({
    queryKey: ["history", range.period, range.interval],
    queryFn: () =>
      apiGet<Snapshot[]>(
        `/portfolio/history?period=${range.period}&interval=${range.interval}`
      ),
    refetchInterval: 60_000,
  });

  async function snapshot() {
    await apiPost("/portfolio/snapshot");
    toast.success("Snapshot taken");
    qc.invalidateQueries({ queryKey: ["history"] });
  }

  const isIntraday = ["5m", "15m", "1h"].includes(range.interval);
  const series =
    data?.map((s) => {
      const d = new Date(s.ts);
      return {
        ts: d.getTime(),
        label: isIntraday
          ? d.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : d.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
        total: Math.round(s.total_usd),
        pl: Math.round(s.total_pl_usd),
      };
    }) ?? [];

  const last = series[series.length - 1];
  const first = series[0];
  const periodChange = first && last ? last.total - first.total : 0;
  const periodPct = first?.total ? periodChange / first.total : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Portfolio history</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={snapshot} className="h-7 gap-1 text-xs">
            <Camera className="h-3 w-3" />
            Snapshot
          </Button>
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5">
            {RANGES.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setRangeIdx(i)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  rangeIdx === i
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>No snapshots yet.</p>
            <Button onClick={snapshot} size="sm" variant="secondary">
              Take first snapshot
            </Button>
          </div>
        ) : series.length === 1 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>Only 1 snapshot ({fmt(series[0].total)}). Time-series builds up automatically.</p>
            <Button onClick={snapshot} size="sm" variant="secondary">
              Take another snapshot
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {fmt(last.total)}
              </span>
              <span
                className={`text-sm font-medium ${
                  periodChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {periodChange >= 0 ? "+" : ""}
                {fmt(periodChange)} ({(periodPct * 100).toFixed(2)}%)
              </span>
              <span className="text-xs text-muted-foreground">
                {range.label} · {range.interval}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  tickFormatter={(v) =>
                    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                  formatter={(v) => fmt(Number(v))}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#tg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
