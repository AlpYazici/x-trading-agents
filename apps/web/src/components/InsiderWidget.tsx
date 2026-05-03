"use client";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, type InsiderTrade } from "@/lib/api";

export function InsiderWidget({ symbols }: { symbols: string[] }) {
  const symbolsParam = symbols.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["insider", symbolsParam],
    queryFn: () =>
      apiGet<InsiderTrade[]>(
        `/insider/multi?symbols=${encodeURIComponent(symbolsParam)}`
      ),
    refetchInterval: 60 * 60 * 1000, // 1h
    enabled: symbols.length > 0,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Landmark className="h-3.5 w-3.5 text-primary" />
          Insider & Congress trades
        </CardTitle>
        <span className="text-[11px] text-muted-foreground">1h</span>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : !data?.length ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No insider activity for watchlist.
          </div>
        ) : (
          <ul className="max-h-[360px] divide-y overflow-y-auto">
            {data.map((t, i) => (
              <li
                key={i}
                className="flex items-start gap-2 px-3 py-2 transition hover:bg-accent/40"
              >
                <SourceBadge source={t.source} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12px] leading-snug">
                    <span className="truncate font-medium">
                      {t.person ?? "Unknown"}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t.role}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="px-1.5 py-0 text-[9px] font-mono"
                    >
                      {t.ticker}
                    </Badge>
                    <SideTag side={t.transaction_type} />
                    <span className="font-mono">
                      {fmtAmount(t.amount_min, t.amount_max, t.source)}
                    </span>
                    {t.transaction_date && (
                      <span>
                        · {t.transaction_date} ({fmtAgo(t.transaction_date)})
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SourceBadge({ source }: { source: InsiderTrade["source"] }) {
  const cfg = {
    house: {
      label: "House",
      cls: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    },
    senate: {
      label: "Senate",
      cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    },
    corporate: {
      label: "Insider",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
  }[source];
  return (
    <Badge
      variant="secondary"
      className={`mt-0.5 flex-shrink-0 px-1.5 py-0 text-[9px] ${cfg.cls}`}
    >
      {cfg.label}
    </Badge>
  );
}

function SideTag({ side }: { side: string }) {
  const isBuy = side === "buy";
  const isSell = side === "sell";
  if (!isBuy && !isSell) {
    return <span className="text-muted-foreground">{side}</span>;
  }
  return (
    <span
      className={`rounded px-1 py-0 text-[9px] font-medium uppercase ${
        isBuy
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-red-500/15 text-red-700 dark:text-red-300"
      }`}
    >
      {side}
    </span>
  );
}

function fmtAmount(
  lo: number | null,
  hi: number | null,
  source: InsiderTrade["source"]
): string {
  if (lo == null && hi == null) return "—";
  if (source === "corporate") {
    // exact $ value
    const v = lo ?? hi ?? 0;
    return fmtUsdShort(v);
  }
  if (lo != null && hi != null && lo !== hi) {
    return `${fmtUsdShort(lo)}-${fmtUsdShort(hi)}`;
  }
  return fmtUsdShort(lo ?? hi ?? 0);
}

function fmtUsdShort(n: number): string {
  if (!n) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtAgo(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return "future";
  if (days === 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
