"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = {
  key: string;
  runs: number;
  wins: number;
  losses: number;
  neutral: number;
  win_rate: number | null;
  avg_alpha: number | null;
  avg_return?: number | null;
};

type Attribution = {
  total_runs_verified: number;
  by_ticker: Row[];
  by_sector: Row[];
  by_signal: Row[];
};

export function AttributionPanel() {
  const [holdingDays, setHoldingDays] = useState(5);
  const { data, isLoading } = useQuery({
    queryKey: ["attribution", holdingDays],
    queryFn: () =>
      apiGet<Attribution>(`/attribution?holding_days=${holdingDays}&min_age_days=${holdingDays}`),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Performance attribution
          </CardTitle>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Win rate / alpha vs SPY, broken down by ticker, sector, signal — over runs older than {holdingDays}d.
            {data && ` ${data.total_runs_verified} runs verified.`}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 text-[10px]">
          {[5, 10, 21, 60].map((d) => (
            <button
              key={d}
              onClick={() => setHoldingDays(d)}
              className={`rounded-md px-2 py-1 font-medium transition ${
                holdingDays === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Computing attribution… (yfinance lookup)</div>
        ) : !data || data.total_runs_verified === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No completed runs older than {holdingDays} days yet — need history before attribution can be computed.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AttrTable title="By signal" rows={data.by_signal} keyLabel="Signal" />
            <AttrTable title="By ticker" rows={data.by_ticker.slice(0, 10)} keyLabel="Ticker" showRet />
            <AttrTable title="By sector" rows={data.by_sector.slice(0, 10)} keyLabel="Sector" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttrTable({
  title,
  rows,
  keyLabel,
  showRet = false,
}: {
  title: string;
  rows: Row[];
  keyLabel: string;
  showRet?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between border-b border-border/40 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{keyLabel}</span>
          <div className="flex items-center gap-2">
            <span>n</span>
            <span className="w-12 text-right">Win %</span>
            {showRet && <span className="w-12 text-right">Ret</span>}
            <span className="w-12 text-right">α vs SPY</span>
          </div>
        </div>
        {rows.map((r) => {
          const winPct = r.win_rate;
          const winColor =
            winPct == null
              ? "text-muted-foreground"
              : winPct >= 0.6
                ? "text-emerald-600 dark:text-emerald-400"
                : winPct < 0.4
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground";
          const alphaColor =
            r.avg_alpha == null
              ? "text-muted-foreground"
              : r.avg_alpha >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
          const arrow =
            winPct == null ? <Minus className="h-2.5 w-2.5" /> :
            winPct >= 0.55 ? <TrendingUp className="h-2.5 w-2.5" /> :
            winPct <= 0.45 ? <TrendingDown className="h-2.5 w-2.5" /> :
            <Minus className="h-2.5 w-2.5" />;
          return (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-md py-1.5 text-xs transition hover:bg-accent/40"
            >
              <span className="truncate font-medium">{r.key}</span>
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span className="text-muted-foreground">{r.runs}</span>
                <span className={`flex w-12 items-center justify-end gap-0.5 ${winColor}`}>
                  {arrow}
                  {winPct == null ? "—" : `${(winPct * 100).toFixed(0)}%`}
                </span>
                {showRet && (
                  <span className="w-12 text-right text-muted-foreground">
                    {r.avg_return == null ? "—" : `${r.avg_return >= 0 ? "+" : ""}${(r.avg_return * 100).toFixed(1)}%`}
                  </span>
                )}
                <span className={`w-12 text-right ${alphaColor}`}>
                  {r.avg_alpha == null ? "—" : `${r.avg_alpha >= 0 ? "+" : ""}${(r.avg_alpha * 100).toFixed(1)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
