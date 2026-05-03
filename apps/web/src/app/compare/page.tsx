"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  GitCompare,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, type Run, type Order } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";

type SignalFamily = "all" | "buy" | "sell" | "hold";

const FILTERS: { id: SignalFamily; label: string }[] = [
  { id: "all", label: "All" },
  { id: "buy", label: "BUY family" },
  { id: "sell", label: "SELL family" },
  { id: "hold", label: "HOLD" },
];

function classifySignal(signal: string | null | undefined): SignalFamily {
  if (!signal) return "hold";
  const s = signal.toUpperCase();
  if (s.includes("BUY") || s.includes("OVERWEIGHT")) return "buy";
  if (s.includes("SELL") || s.includes("UNDERWEIGHT")) return "sell";
  return "hold";
}

function dotColorForSignal(signal: string | null | undefined): string {
  const fam = classifySignal(signal);
  if (fam === "buy") return "bg-emerald-500";
  if (fam === "sell") return "bg-red-500";
  return "bg-muted-foreground/40";
}

export default function ComparePage() {
  const { data } = useQuery({
    queryKey: ["runs", "compare"],
    queryFn: () => apiGet<Run[]>("/runs?limit=200"),
    refetchInterval: 5_000,
  });

  const [filter, setFilter] = useState<SignalFamily>("all");
  const [tableOpen, setTableOpen] = useState(false);
  const [stagingId, setStagingId] = useState<number | null>(null);

  const completed = useMemo(
    () => (data ?? []).filter((r) => r.status === "completed"),
    [data]
  );

  // Group by ticker — newest first per group.
  const groups = useMemo(() => {
    const m = new Map<string, Run[]>();
    for (const r of completed) {
      const arr = m.get(r.ticker) ?? [];
      arr.push(r);
      m.set(r.ticker, arr);
    }
    const out: { ticker: string; runs: Run[] }[] = [];
    for (const [ticker, runs] of m) {
      runs.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      out.push({ ticker, runs });
    }
    out.sort((a, b) => {
      const ad = a.runs[0]?.started_at ?? "";
      const bd = b.runs[0]?.started_at ?? "";
      return ad < bd ? 1 : -1;
    });
    return out;
  }, [completed]);

  const filteredGroups = useMemo(() => {
    if (filter === "all") return groups;
    return groups.filter((g) => classifySignal(g.runs[0]?.signal) === filter);
  }, [groups, filter]);

  async function stage(runId: number) {
    setStagingId(runId);
    try {
      const o = (await apiPost<Order>(`/trades/from-run/${runId}`)) as Order;
      if (o.status === "rejected" || o.status === "hold") {
        toast.warning(`Order ${o.status}`, {
          description: o.rejection_reason ?? "no action",
        });
      } else {
        toast.success("Order staged", {
          description: `${o.symbol} ${o.side} ${o.qty}`,
        });
        window.location.href = "/trades";
      }
    } catch (e) {
      toast.error("Stage failed", { description: String(e) });
    } finally {
      setStagingId(null);
    }
  }

  const totalRuns = completed.length;
  const totalTickers = groups.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <GitCompare className="h-3.5 w-3.5" />
          Side-by-side
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
            Compare runs
          </h1>
          <div className="text-sm text-muted-foreground">
            {totalTickers} {totalTickers === 1 ? "ticker" : "tickers"} ·{" "}
            {totalRuns} completed {totalRuns === 1 ? "run" : "runs"}
          </div>
        </div>
      </header>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                "rounded-md border px-3 py-1.5 text-xs font-medium transition " +
                (active
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {!filteredGroups.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GitCompare className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {totalRuns === 0
                ? "No runs yet — run a debate from the dashboard."
                : "No runs match this filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((g) => {
            const latest = g.runs[0];
            const isStaging = stagingId === latest.id;
            return (
              <Card
                key={g.ticker}
                className="group transition hover:border-primary/40 hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div>
                    <CardTitle className="text-2xl font-bold tracking-tight">
                      {g.ticker}
                    </CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {g.runs.length} {g.runs.length === 1 ? "run" : "runs"} ·
                      latest {latest.trade_date}
                    </div>
                  </div>
                  <SignalBadge signal={latest.signal} />
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Mini timeline */}
                  <div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Timeline (oldest → newest)
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[...g.runs].reverse().map((r) => (
                        <span
                          key={r.id}
                          title={`Run #${r.id} · ${r.trade_date} · ${r.signal ?? "—"}`}
                          className={
                            "h-2.5 w-2.5 rounded-full ring-1 ring-border " +
                            dotColorForSignal(r.signal)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Latest decision preview */}
                  {latest.final_decision && (
                    <p className="line-clamp-3 text-xs text-foreground/70">
                      {latest.final_decision.slice(0, 240)}
                      {latest.final_decision.length > 240 ? "…" : ""}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <Link
                      href={`/runs/${latest.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View latest
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stage(latest.id)}
                      disabled={isStaging}
                      className="gap-1.5"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {isStaging ? "Staging…" : "Stage order"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full table — collapsible */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            All runs ({completed.length})
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTableOpen((v) => !v)}
            className="gap-1.5"
          >
            {tableOpen ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Expand
              </>
            )}
          </Button>
        </CardHeader>
        {tableOpen && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!completed.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No completed runs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  completed.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-muted-foreground">
                        <Link
                          href={`/runs/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {r.id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {r.ticker}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.trade_date}
                      </TableCell>
                      <TableCell>
                        <StatusDot status={r.status} />
                      </TableCell>
                      <TableCell>
                        <SignalBadge signal={r.signal} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.started_at}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
