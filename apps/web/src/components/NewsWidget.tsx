"use client";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, type NewsItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export function NewsWidget({ symbols }: { symbols: string[] }) {
  const symbolsParam = symbols.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["news", symbolsParam],
    queryFn: () =>
      apiGet<NewsItem[]>(`/markets/news/multi?symbols=${encodeURIComponent(symbolsParam)}`),
    refetchInterval: 5 * 60 * 1000,
    enabled: symbols.length > 0,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Newspaper className="h-3.5 w-3.5 text-primary" />
          News · Watchlist
        </CardTitle>
        <span className="text-[11px] text-muted-foreground">5min</span>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading...</div>
        ) : !data?.length ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No news.</div>
        ) : (
          <ul className="max-h-[280px] divide-y overflow-y-auto">
            {data.slice(0, 15).map((n, i) => (
              <li key={i}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 px-3 py-2 transition hover:bg-accent/40"
                >
                  {n.symbol && (
                    <Badge
                      variant="secondary"
                      className="mt-0.5 flex-shrink-0 px-1.5 py-0 text-[9px] font-mono"
                    >
                      {n.symbol}
                    </Badge>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] leading-snug group-hover:text-primary">
                      {n.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="truncate">{n.publisher}</span>
                      {n.published_at && <span>· {fmtTime(n.published_at)}</span>}
                    </div>
                  </div>
                  <ExternalLink className="mt-1 h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function fmtTime(t: string | number): string {
  let d: Date;
  if (typeof t === "number") d = new Date(t * 1000);
  else d = new Date(t);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
