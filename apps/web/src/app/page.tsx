"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Brain,
  Activity,
  Briefcase,
} from "lucide-react";
import { apiGet, apiPost, type Run, type Holding } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";
import { MarketsGroups } from "@/components/MarketsWidget";
import { AddMarketDialog } from "@/components/AddMarketDialog";
import { HeatmapWidget } from "@/components/HeatmapWidget";
import { SectorWidget } from "@/components/SectorWidget";
import { NewsWidget } from "@/components/NewsWidget";
import { EarningsWidget } from "@/components/EarningsWidget";
import { InsiderWidget } from "@/components/InsiderWidget";
import { BatchAnalyzeDialog } from "@/components/BatchAnalyzeDialog";
import { useMarketGroup } from "@/lib/userMarkets";
import { toast } from "sonner";

type Quote = {
  symbol: string;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[];
};

const PULSE = [
  { label: "S&P 500",  symbol: "^GSPC",    exchange: "US", unit: "" },
  { label: "BIST 100", symbol: "XU100.IS", exchange: "US", unit: "" },
  { label: "USD/TRY",  symbol: "USDTRY=X", exchange: "US", unit: "₺" },
  { label: "Gold",     symbol: "GC=F",     exchange: "US", unit: "$/oz" },
  { label: "Crude",    symbol: "CL=F",     exchange: "US", unit: "$/bbl" },
];

export default function Dashboard() {
  const router = useRouter();
  const { list: stocks } = useMarketGroup("stocks");
  const stockSymbols = stocks.map((s) => s.symbol);
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    try {
      const r = await apiPost<{ run_id: number }>("/runs", { ticker: t });
      toast.success(`Run #${r.run_id} started for ${t}`);
      router.push(`/runs/${r.run_id}`);
    } catch (e) {
      toast.error("Could not start run", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

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
    <div className="space-y-6">
      {/* HERO — quick analysis */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 via-card to-indigo-500/10 shadow-md">
        <CardContent className="relative p-5 sm:p-8">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />

          <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                <Sparkles className="h-3 w-3 text-violet-500" />
                Multi-agent debate · Claude Sonnet 4.6
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">
                Analyze any ticker
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Analysts gather data → bull vs bear debate → trader proposes →
                risk team reviews → final BUY / SELL / HOLD on your screen in 2–5 minutes.
              </p>
              <form onSubmit={startRun} className="mt-5 flex max-w-md gap-2">
                <Input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL · NVDA · TSLA · MSFT"
                  className="h-11 text-base"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy || !ticker.trim()}
                  className="gap-2 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500"
                >
                  {busy ? "Starting..." : "Run debate"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Quick:</span>
                {["NVDA", "TSLA", "AAPL", "META"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTicker(t)}
                    className="rounded-md border bg-background/60 px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground">·</span>
                <BatchAnalyzeDialog />
                <span className="ml-auto text-[11px] text-muted-foreground">
                  ~$0.20 · 2–5 min
                </span>
              </div>
            </div>

            {/* Live agent OR recent decision card */}
            <div className="relative">
              {liveRun ? (
                <Link
                  href={`/runs/${liveRun.id}`}
                  className="block rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 transition hover:border-amber-500/60"
                >
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <Activity className="pulse-soft h-3.5 w-3.5" />
                    Live agent
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{liveRun.ticker}</div>
                  <div className="text-xs text-muted-foreground">
                    Run #{liveRun.id} · {liveRun.trade_date}
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    Click to watch the debate live →
                  </div>
                </Link>
              ) : runs?.[0] ? (
                <Link
                  href={`/runs/${runs[0].id}`}
                  className="block rounded-2xl border bg-card/60 p-5 backdrop-blur transition hover:border-primary/40"
                >
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Brain className="h-3.5 w-3.5" />
                    Latest decision
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="text-2xl font-semibold">{runs[0].ticker}</div>
                    <SignalBadge signal={runs[0].signal} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Run #{runs[0].id} · {runs[0].trade_date}
                  </div>
                  {runs[0].final_decision && (
                    <p className="mt-3 line-clamp-3 text-xs text-foreground/70">
                      {runs[0].final_decision.slice(0, 200)}...
                    </p>
                  )}
                </Link>
              ) : (
                <div className="rounded-2xl border bg-card/60 p-8 text-center backdrop-blur">
                  <Brain className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No runs yet. Type a ticker and let the agents go to work.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TODAY'S PULSE — 5 compact tiles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Today's pulse
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">live · 60s refresh</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
                  className="group flex flex-col gap-1 rounded-xl border bg-card/40 p-3 transition hover:border-primary/40 hover:bg-card hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                      {p.label}
                    </span>
                    {pct != null && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                          up
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {up ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {(pct * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {last == null ? "—" : fmtN(last)}
                  </div>
                  {p.unit && (
                    <div className="text-[10px] text-muted-foreground">{p.unit}</div>
                  )}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* MARKETS — header + Add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Markets</h2>
        <AddMarketDialog />
      </div>
      <MarketsGroups />

      {/* HEATMAP + SECTORS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HeatmapWidget symbols={stockSymbols} title="Watchlist heatmap" />
        </div>
        <SectorWidget />
      </div>

      {/* NEWS + EARNINGS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NewsWidget symbols={stockSymbols} />
        </div>
        <EarningsWidget symbols={stockSymbols} />
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
