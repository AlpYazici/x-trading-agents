"use client";
import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Brain,
  Activity,
  Briefcase,
} from "lucide-react";
import { apiGet, type Run, type Holding } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";
import { MarketsGroups } from "@/components/MarketsWidget";
import { AddMarketDialog } from "@/components/AddMarketDialog";
import { HeatmapWidget } from "@/components/HeatmapWidget";
import { SectorWidget } from "@/components/SectorWidget";
import { NewsWidget } from "@/components/NewsWidget";
import { EarningsWidget } from "@/components/EarningsWidget";
import { InsiderWidget } from "@/components/InsiderWidget";
import { useMarketGroup } from "@/lib/userMarkets";

type Quote = {
  symbol: string;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[];
};

const PULSE = [
  // Indices
  { label: "S&P 500",  symbol: "^GSPC",    exchange: "US", unit: "" },
  { label: "Nasdaq",   symbol: "^IXIC",    exchange: "US", unit: "" },
  { label: "Dow",      symbol: "^DJI",     exchange: "US", unit: "" },
  { label: "BIST 100", symbol: "XU100.IS", exchange: "US", unit: "" },
  { label: "VIX",      symbol: "^VIX",     exchange: "US", unit: "" },
  // FX
  { label: "USD/TRY",  symbol: "USDTRY=X", exchange: "US", unit: "₺" },
  { label: "EUR/USD",  symbol: "EURUSD=X", exchange: "US", unit: "" },
  { label: "DXY",      symbol: "DX-Y.NYB", exchange: "US", unit: "" },
  // Commodities
  { label: "Gold",     symbol: "GC=F",     exchange: "US", unit: "$/oz" },
  { label: "Silver",   symbol: "SI=F",     exchange: "US", unit: "$/oz" },
  { label: "Crude",    symbol: "CL=F",     exchange: "US", unit: "$/bbl" },
  { label: "Nat Gas",  symbol: "NG=F",     exchange: "US", unit: "$/MMBtu" },
  // Crypto
  { label: "BTC",      symbol: "BTC-USD",  exchange: "CRYPTO", unit: "USD" },
  { label: "ETH",      symbol: "ETH-USD",  exchange: "CRYPTO", unit: "USD" },
];

export default function Dashboard() {
  const { list: stocks } = useMarketGroup("stocks");
  const stockSymbols = stocks.map((s) => s.symbol);

  const { data: runs } = useQuery({
    queryKey: ["runs"],
    queryFn: () => apiGet<Run[]>("/runs?limit=8"),
    refetchInterval: 3_000,
  });
  const { data: holdings } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => apiGet<Holding[]>("/holdings"),
    refetchInterval: 30_000,
  });

  const pulseQueries = useQueries({
    queries: PULSE.map((p) => ({
      queryKey: ["quote", p.symbol, p.exchange],
      queryFn: () =>
        apiGet<Quote>(
          `/ohlc/quote?symbol=${encodeURIComponent(p.symbol)}&exchange=${p.exchange}`
        ),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  });

  const liveRun = runs?.find((r) => r.status === "running");
  const totalUsd =
    holdings?.reduce((s, h) => s + (h.market_value_usd ?? 0), 0) ?? 0;
  const totalPlUsd =
    holdings?.reduce(
      (s, h) => s + (h.pl && h.fx_rate ? h.pl * h.fx_rate : 0),
      0
    ) ?? 0;
  const plPct = totalUsd - totalPlUsd > 0 ? totalPlUsd / (totalUsd - totalPlUsd) : 0;

  return (
    <div className="space-y-5">
      {/* Compact live-agent banner — only when a run is active */}
      {liveRun && (
        <Link
          href={`/runs/${liveRun.id}`}
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm transition hover:border-amber-500/60"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <Activity className="pulse-soft h-3.5 w-3.5" />
            <span className="font-medium">Live agent debate · {liveRun.ticker}</span>
            <span className="text-xs text-muted-foreground">
              Run #{liveRun.id} · {liveRun.trade_date}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Watch live →</span>
        </Link>
      )}

      {/* TODAY'S PULSE — indices + commodities + crypto, prominent at top */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Today's pulse
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">live · 60s refresh</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {PULSE.map((p, i) => {
              const q = pulseQueries[i].data;
              const last = q?.last;
              const pct = q?.change_pct;
              const up = (pct ?? 0) >= 0;
              const href = `/chart?s=${encodeURIComponent(p.symbol)}&ex=${p.exchange}&label=${encodeURIComponent(p.label)}`;
              return (
                <Link
                  key={p.symbol}
                  href={href}
                  className="group flex flex-col gap-0.5 rounded-lg border border-border/40 bg-card/30 p-2.5 transition hover:border-primary/40 hover:bg-card hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                      {p.label}
                    </span>
                    {pct != null && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                          up
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {up ? (
                          <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {(pct * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-base font-semibold tabular-nums">
                    {last == null ? "—" : fmtN(last)}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* NEWS + EARNINGS — high-priority news up top */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NewsWidget symbols={stockSymbols} />
        </div>
        <EarningsWidget symbols={stockSymbols} />
      </div>

      {/* MARKETS — softer styling, more transparent */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-medium text-muted-foreground">Markets</h2>
        <AddMarketDialog />
      </div>
      <div className="opacity-90">
        <MarketsGroups />
      </div>

      {/* HEATMAP + SECTORS — smaller, more transparent */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 [&_.bg-card]:bg-card/40 [&_.border]:border-border/40">
          <HeatmapWidget symbols={stockSymbols} title="Watchlist heatmap" />
        </div>
        <div className="[&_.bg-card]:bg-card/40 [&_.border]:border-border/40">
          <SectorWidget />
        </div>
      </div>

      {/* INSIDER + CONGRESS TRADES */}
      <InsiderWidget symbols={stockSymbols} />

      {/* AGENT ACTIVITY + portfolio summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-3.5 w-3.5 text-primary" />
              Agent activity
            </CardTitle>
            <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground">
              All runs →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!runs?.length ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No agent runs yet.
              </div>
            ) : (
              <ul className="divide-y">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/runs/${r.id}`}
                      className="flex items-center justify-between px-6 py-3 text-sm transition hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
                        <span className="font-semibold">{r.ticker}</span>
                        <span className="text-xs text-muted-foreground">{r.trade_date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <SignalBadge signal={r.signal} />
                        <StatusDot status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              Portfolio
            </CardTitle>
            <Link href="/portfolio" className="text-xs text-muted-foreground hover:text-foreground">
              Manage →
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total value
                </div>
                <div className="font-mono text-2xl font-semibold tabular-nums">
                  {fmtUsd(totalUsd)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total P/L
                </div>
                <div
                  className={`font-mono text-xl font-semibold tabular-nums ${
                    totalPlUsd >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {totalPlUsd >= 0 ? "+" : ""}
                  {fmtUsd(totalPlUsd)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({plPct >= 0 ? "+" : ""}{(plPct * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="border-t pt-3">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Holdings
                </div>
                <ul className="space-y-1.5">
                  {holdings?.map((h) => {
                    const pl = h.pl && h.fx_rate ? h.pl * h.fx_rate : 0;
                    return (
                      <li
                        key={h.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {h.exchange}
                          </Badge>
                          <span className="font-medium">{h.symbol}</span>
                        </span>
                        <span
                          className={`font-mono text-xs tabular-nums ${
                            pl >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {pl >= 0 ? "+" : ""}
                          {fmtUsd(pl)}
                        </span>
                      </li>
                    );
                  })}
                  {!holdings?.length && (
                    <li className="text-xs text-muted-foreground">No holdings.</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function fmtN(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 10) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}
