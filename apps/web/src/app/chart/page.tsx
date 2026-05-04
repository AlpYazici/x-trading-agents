"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Brain,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradingChart } from "@/components/TradingChart";
import { toast } from "sonner";

type Quote = {
  symbol: string;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[];
};

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const symbol = sp.get("s") ?? "";
  const exchange = sp.get("ex") ?? "US";
  const label = sp.get("label") ?? symbol;

  const { data: quote, isLoading } = useQuery({
    queryKey: ["chart-quote", symbol, exchange],
    queryFn: () =>
      apiGet<Quote>(
        `/ohlc/quote?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`
      ),
    enabled: !!symbol,
    refetchInterval: 30_000,
  });

  if (!symbol) {
    return <div className="text-muted-foreground">No symbol given.</div>;
  }

  // Only allow agent debate for plain US-style tickers (no special chars)
  const canAnalyze =
    !/[\^=./-]/.test(symbol) && !symbol.endsWith("USDT") && exchange === "US";

  async function startRun() {
    try {
      const r = await apiPost<{ run_id: number }>("/runs", { ticker: symbol });
      toast.success(`Analyzing ${symbol}`);
      router.push(`/runs/${r.run_id}`);
    } catch (e) {
      toast.error("Could not start run", { description: String(e) });
    }
  }

  const last = quote?.last;
  const pct = quote?.change_pct;
  const up = (pct ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to dashboard
          </Link>
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{label}</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              {symbol}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {exchange}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="font-mono text-2xl font-semibold tabular-nums">
              {isLoading ? "..." : last != null ? fmt(last) : "—"}
            </div>
            {pct != null && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium ${
                  up
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}
              >
                {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {(pct * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {canAnalyze && (
          <Button
            onClick={startRun}
            className="gap-2 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20"
          >
            <Brain className="h-4 w-4" />
            Run agent debate
          </Button>
        )}
      </header>

      <Card>
        <CardContent className="p-4">
          <TradingChart symbol={symbol} exchange={exchange} height={560} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent closes (5d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {(quote?.sparkline ?? []).slice(-5).map((c, i) => (
                <div key={i} className="rounded-lg border bg-card/50 p-3">
                  <div className="text-[10px] text-muted-foreground">
                    {i === 4 ? "today" : `${4 - i}d ago`}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold">{fmt(c)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <Row label="Symbol" value={symbol} />
              <Row label="Exchange" value={exchange} />
              <Row label="Last" value={last != null ? fmt(last) : "—"} />
              <Row label="Prev close" value={quote?.prev_close != null ? fmt(quote.prev_close) : "—"} />
              <Row
                label="Change"
                value={
                  quote?.change != null
                    ? `${quote.change >= 0 ? "+" : ""}${fmt(quote.change)} (${(quote.change_pct! * 100).toFixed(2)}%)`
                    : "—"
                }
                tone={(quote?.change ?? 0) >= 0 ? "emerald" : "red"}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium ${cls}`}>{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 10) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

export default function ChartPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <Inner />
    </Suspense>
  );
}
