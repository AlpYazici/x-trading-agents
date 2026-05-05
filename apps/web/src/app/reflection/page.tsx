"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { apiGet } from "@/lib/api";
import { AttributionPanel } from "@/components/AttributionPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReflectionEntry = {
  ticker: string;
  date: string;
  rating: string | null;
  status: "pending" | "resolved";
  decision: string;
  raw_return: number | null;
  alpha_return: number | null;
  holding_days: number | null;
  reflection: string | null;
};

type ReflectionStats = {
  total: number;
  pending: number;
  resolved: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_return: number;
  avg_alpha: number;
  by_rating: Record<string, number>;
};

type ReflectionResponse = {
  entries: ReflectionEntry[];
  stats: ReflectionStats;
};

const RATING_ORDER = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];

const WIN_COLOR = "#10b981";
const LOSS_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#94a3b8";

export default function ReflectionPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reflection"],
    queryFn: () => apiGet<ReflectionResponse>("/reflection"),
  });

  const [tab, setTab] = useState<string>("all");

  const entries = data?.entries ?? [];
  const stats = data?.stats;

  const filtered = useMemo(() => {
    if (tab === "pending") return entries.filter((e) => e.status === "pending");
    if (tab === "resolved") return entries.filter((e) => e.status === "resolved");
    return entries;
  }, [entries, tab]);

  const winLossData = useMemo(() => {
    if (!stats) return [];
    const breakeven = Math.max(0, stats.resolved - stats.wins - stats.losses);
    const arr = [
      { name: "Wins", value: stats.wins, color: WIN_COLOR },
      { name: "Losses", value: stats.losses, color: LOSS_COLOR },
    ];
    if (breakeven > 0) arr.push({ name: "Break-even", value: breakeven, color: NEUTRAL_COLOR });
    return arr.filter((d) => d.value > 0);
  }, [stats]);

  const ratingData = useMemo(() => {
    if (!stats) return [];
    const known = RATING_ORDER.map((r) => ({ name: r, count: stats.by_rating[r] ?? 0 }));
    // include unknown ratings at the end
    const extras = Object.entries(stats.by_rating)
      .filter(([k]) => !RATING_ORDER.includes(k))
      .map(([k, v]) => ({ name: k, count: v }));
    return [...known, ...extras];
  }, [stats]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Reflection — agent performance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Decision history, win rate, and post-trade reflections from the TradingAgents memory log.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Failed to load reflection log: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Performance attribution — outcomes rolled up by ticker / sector / signal */}
      <AttributionPanel />

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Total decisions" value={fmtInt(stats?.total)} sub="all entries" />
        <Metric
          label="Resolved"
          value={fmtInt(stats?.resolved)}
          sub={`${fmtInt(stats?.pending)} pending`}
        />
        <Metric
          label="Win rate"
          value={stats ? `${(stats.win_rate * 100).toFixed(1)}%` : "—"}
          sub={stats ? `${stats.wins}W / ${stats.losses}L` : "no data"}
          tone={stats && stats.win_rate >= 0.5 ? "emerald" : stats && stats.resolved > 0 ? "red" : undefined}
        />
        <Metric
          label="Avg return"
          value={stats ? fmtPct(stats.avg_return) : "—"}
          sub={stats ? `α ${fmtPct(stats.avg_alpha)}` : "vs SPY"}
          tone={stats && stats.avg_return >= 0 ? "emerald" : stats && stats.resolved > 0 ? "red" : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Wins vs Losses</CardTitle>
          </CardHeader>
          <CardContent>
            {winLossData.length === 0 ? (
              <Empty msg={isLoading ? "Loading…" : "No resolved decisions yet"} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={winLossData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="none"
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {winLossData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                    formatter={(v) => String(Number(v))}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Distribution by rating</CardTitle>
          </CardHeader>
          <CardContent>
            {ratingData.every((r) => r.count === 0) ? (
              <Empty msg={isLoading ? "Loading…" : "No decisions yet"} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                    formatter={(v) => String(Number(v))}
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {ratingData.map((d, i) => (
                      <Cell key={i} fill={ratingColor(d.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table with filters */}
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <CardTitle className="text-sm font-medium">Decision history</CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({stats?.pending ?? 0})
              </TabsTrigger>
              <TabsTrigger value="resolved">
                Resolved ({stats?.resolved ?? 0})
              </TabsTrigger>
            </TabsList>
            <TabsContent value={tab} />
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">Alpha</TableHead>
                <TableHead>Reflection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {isLoading ? "Loading…" : "No entries to show."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e, i) => (
                  <TableRow key={`${e.date}-${e.ticker}-${i}`}>
                    <TableCell className="font-mono text-xs">{e.date}</TableCell>
                    <TableCell className="font-semibold">{e.ticker}</TableCell>
                    <TableCell>
                      <RatingBadge rating={e.rating} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${returnTone(e.raw_return)}`}
                    >
                      {e.raw_return == null ? "—" : fmtPct(e.raw_return)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${returnTone(e.alpha_return)}`}
                    >
                      {e.alpha_return == null ? "—" : fmtPct(e.alpha_return)}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">
                      {truncate(e.reflection ?? e.decision, 140)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "emerald" | "red";
}) {
  const valueCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={`mt-2 text-2xl font-semibold tracking-tight ${valueCls}`}>
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-muted-foreground">—</span>;
  const variant: "default" | "secondary" | "destructive" | "outline" =
    rating === "Strong Buy" || rating === "Buy"
      ? "default"
      : rating === "Strong Sell" || rating === "Sell"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{rating}</Badge>;
}

function StatusBadge({ status }: { status: "pending" | "resolved" }) {
  return (
    <Badge variant={status === "resolved" ? "outline" : "secondary"}>
      {status}
    </Badge>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}

function ratingColor(name: string): string {
  switch (name) {
    case "Strong Buy":
      return "#059669";
    case "Buy":
      return "#10b981";
    case "Hold":
      return "#94a3b8";
    case "Sell":
      return "#f59e0b";
    case "Strong Sell":
      return "#ef4444";
    default:
      return "#8b5cf6";
  }
}

function returnTone(v: number | null): string {
  if (v == null) return "";
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function fmtInt(v: number | undefined): string {
  if (v == null) return "—";
  return String(v);
}

function truncate(s: string, n: number): string {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}
