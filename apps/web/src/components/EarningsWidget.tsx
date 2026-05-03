"use client";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, type EarningsItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export function EarningsWidget({ symbols }: { symbols: string[] }) {
  const symbolsParam = symbols.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["earnings", symbolsParam],
    queryFn: () =>
      apiGet<EarningsItem[]>(`/markets/earnings/multi?symbols=${encodeURIComponent(symbolsParam)}`),
    refetchInterval: 60 * 60 * 1000, // 1h
    enabled: symbols.length > 0,
  });

  // Sort by next earnings date asc
  const sorted = (data ?? []).slice().sort((a, b) => {
    const av = a.next_earnings ? new Date(a.next_earnings).getTime() : Infinity;
    const bv = b.next_earnings ? new Date(b.next_earnings).getTime() : Infinity;
    return av - bv;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          Upcoming earnings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !sorted.length ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            No earnings data.
          </div>
        ) : (
          <ul className="max-h-[300px] divide-y overflow-y-auto">
            {sorted.map((e) => {
              const days = e.next_earnings
                ? Math.round((new Date(e.next_earnings).getTime() - Date.now()) / 86400000)
                : null;
              const close = days != null && days <= 7;
              return (
                <li key={e.symbol}>
                  <Link
                    href={`/chart?s=${e.symbol}&ex=US&label=${e.symbol}`}
                    className="flex items-center justify-between px-4 py-2.5 transition hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{e.symbol}</span>
                      {e.eps_estimate != null && (
                        <span className="text-xs text-muted-foreground">
                          EPS est. {e.eps_estimate.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs">{e.next_earnings ?? "—"}</div>
                      {days != null && (
                        <Badge
                          variant={close ? "default" : "secondary"}
                          className={`text-[10px] ${close ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : ""}`}
                        >
                          {days < 0 ? `${-days}d ago` : days === 0 ? "today" : `in ${days}d`}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
