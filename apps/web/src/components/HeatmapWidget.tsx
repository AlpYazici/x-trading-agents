"use client";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { Grid3x3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

type Quote = {
  symbol: string;
  last: number | null;
  change_pct: number | null;
};

export function HeatmapWidget({ symbols, title = "Heatmap" }: { symbols: string[]; title?: string }) {
  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["quote", s, "US"],
      queryFn: () => apiGet<Quote>(`/ohlc/quote?symbol=${encodeURIComponent(s)}&exchange=US`),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Grid3x3 className="h-3.5 w-3.5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {symbols.map((s, i) => {
            const q = queries[i].data;
            return <Tile key={s} symbol={s} quote={q} />;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ symbol, quote }: { symbol: string; quote: Quote | undefined }) {
  const pct = quote?.change_pct;
  // Color intensity based on % change
  const intensity = Math.min(Math.abs((pct ?? 0) * 100) / 5, 1); // cap at 5%
  const bg =
    pct == null
      ? "bg-muted"
      : pct >= 0
        ? `rgba(16,185,129,${0.15 + intensity * 0.5})`
        : `rgba(239,68,68,${0.15 + intensity * 0.5})`;
  const border =
    pct == null
      ? "border"
      : pct >= 0
        ? "border-emerald-500/30"
        : "border-red-500/30";

  return (
    <Link
      href={`/chart?s=${symbol}&ex=US&label=${symbol}`}
      className={`flex aspect-square flex-col items-center justify-center rounded-xl border ${border} transition hover:scale-105`}
      style={pct != null ? { background: bg } : undefined}
    >
      <div className="text-sm font-semibold">{symbol}</div>
      <div
        className={`mt-0.5 text-xs font-medium ${
          pct == null
            ? "text-muted-foreground"
            : pct >= 0
              ? "text-emerald-700 dark:text-emerald-200"
              : "text-red-700 dark:text-red-200"
        }`}
      >
        {pct != null ? `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(2)}%` : "—"}
      </div>
    </Link>
  );
}
