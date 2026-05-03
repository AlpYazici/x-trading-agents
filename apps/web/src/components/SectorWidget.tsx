"use client";
import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, type SectorETF } from "@/lib/api";

type Quote = {
  symbol: string;
  last: number | null;
  change_pct: number | null;
};

export function SectorWidget() {
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiGet<SectorETF[]>("/markets/sectors"),
    staleTime: Infinity,
  });

  const queries = useQueries({
    queries: (sectors ?? []).map((s) => ({
      queryKey: ["quote", s.symbol, "US"],
      queryFn: () => apiGet<Quote>(`/ohlc/quote?symbol=${encodeURIComponent(s.symbol)}&exchange=US`),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  });

  const rows = (sectors ?? [])
    .map((s, i) => ({ ...s, pct: queries[i].data?.change_pct ?? null }))
    .sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-3.5 w-3.5 text-primary" />
          S&P sectors
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {rows.map((s) => {
            const pct = s.pct ?? 0;
            const up = pct >= 0;
            return (
              <li key={s.symbol}>
                <Link
                  href={`/chart?s=${s.symbol}&ex=US&label=${encodeURIComponent(s.label)}`}
                  className="flex items-center justify-between px-4 py-2 text-sm transition hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2">
                    <Bar pct={s.pct} />
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.symbol}</span>
                  </div>
                  {s.pct != null ? (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        up
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {(s.pct * 100).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function Bar({ pct }: { pct: number | null }) {
  if (pct == null) return <div className="h-2 w-12 rounded-full bg-muted" />;
  const w = Math.min(Math.abs(pct * 100) * 8, 48);
  const color = pct >= 0 ? "bg-emerald-500" : "bg-red-500";
  return (
    <div className="flex h-2 w-12 items-center">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}px` }} />
    </div>
  );
}
