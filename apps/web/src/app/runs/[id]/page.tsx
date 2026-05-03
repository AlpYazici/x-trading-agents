"use client";
import { use, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Activity,
  PlayCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { apiGet, apiPost, type Run, type Order } from "@/lib/api";

type BacktestResult = {
  verified: boolean;
  signal?: string;
  direction?: "buy" | "sell" | "hold";
  entry_close?: number | null;
  exit_close?: number | null;
  actual_return?: number | null;
  spy_return?: number | null;
  alpha?: number | null;
  verdict?: "right" | "wrong" | "neutral" | "pending";
  holding_days?: number;
  reason?: string;
};
import { useRunStream } from "@/lib/sse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LightweightChart } from "@/components/LightweightChart";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";
import { toast } from "sonner";

type Params = Promise<{ id: string }>;

export default function RunDetailPage(props: { params: Params }) {
  const { id } = use(props.params);
  const runId = Number(id);

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => apiGet<Run>(`/runs/${runId}`),
    refetchInterval: (q) =>
      q.state.data?.status === "completed" || q.state.data?.status === "failed"
        ? false
        : 2_000,
  });

  const { data: backtest } = useQuery({
    queryKey: ["backtest", runId],
    queryFn: () => apiGet<BacktestResult>(`/backtest/run/${runId}?holding_days=5`),
    enabled: run?.status === "completed",
    staleTime: 5 * 60_000,
  });

  const events = useRunStream(runId);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  async function stage() {
    try {
      const o = (await apiPost<Order>(`/trades/from-run/${runId}`)) as Order;
      if (o.status === "rejected" || o.status === "hold") {
        toast.warning(`Order ${o.status}`, { description: o.rejection_reason ?? "no action" });
      } else {
        toast.success("Order staged", { description: `${o.symbol} ${o.side} ${o.qty}` });
        window.location.href = "/trades";
      }
    } catch (e) {
      toast.error("Stage failed", { description: String(e) });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Run #{runId}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {run?.ticker ?? "..."}
            <span className="ml-3 text-base font-normal text-muted-foreground">
              {run?.trade_date}
            </span>
          </h1>
        </div>
        {run && <StatusDot status={run.status} />}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          {run?.signal && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Signal</div>
                <div
                  className={`mt-2 text-3xl font-bold tracking-tight ${
                    run.signal.toUpperCase().includes("BUY")
                      ? "text-emerald-600 dark:text-emerald-400"
                      : run.signal.toUpperCase().includes("SELL")
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {run.signal}
                </div>
              </CardContent>
            </Card>
          )}

          {backtest && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Backtest verdict</div>
                  <VerdictBadge v={backtest.verdict} />
                </div>
                {backtest.verified ? (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Entry" value={fmtUsd(backtest.entry_close)} />
                      <Stat label={`Exit (${backtest.holding_days}d)`} value={fmtUsd(backtest.exit_close)} />
                      <Stat
                        label="Return"
                        value={pct(backtest.actual_return)}
                        tone={(backtest.actual_return ?? 0) >= 0 ? "emerald" : "red"}
                      />
                      <Stat
                        label="vs SPY (alpha)"
                        value={pct(backtest.alpha)}
                        tone={(backtest.alpha ?? 0) >= 0 ? "emerald" : "red"}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {backtest.reason ?? "not yet verifiable"}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {run?.status === "completed" && (
            <Button
              onClick={stage}
              size="lg"
              className="w-full gap-2 bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20"
            >
              <PlayCircle className="h-4 w-4" />
              Stage order
            </Button>
          )}

          {run?.final_decision && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Final decision
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80">
                  {run.final_decision}
                </pre>
              </CardContent>
            </Card>
          )}

          {run?.error && (
            <Card className="border-red-500/40 bg-red-500/5">
              <CardContent className="p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Error
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-red-700/80 dark:text-red-300/80">
                  {run.error}
                </pre>
              </CardContent>
            </Card>
          )}
        </aside>

        <section className="lg:col-span-2">
          <Tabs defaultValue="debate" className="space-y-4">
            <TabsList>
              <TabsTrigger value="debate" className="gap-2">
                <Brain className="h-3.5 w-3.5" />
                Debate
              </TabsTrigger>
              <TabsTrigger value="chart" className="gap-2">
                <Activity className="h-3.5 w-3.5" />
                Chart
              </TabsTrigger>
            </TabsList>

            <TabsContent value="debate">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="pulse-soft inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    <CardTitle className="text-sm font-medium">Live agent debate</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground">{events.length} events</span>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[68vh] overflow-y-auto pr-2">
                    {events.length === 0 ? (
                      <div className="py-16 text-center">
                        <Brain className="mx-auto h-8 w-8 animate-pulse text-muted-foreground/40" />
                        <div className="mt-3 text-sm text-muted-foreground">
                          Waiting for the graph to start...
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {events.map((e, i) => (
                          <EventRow key={i} event={e.event} data={e.data} />
                        ))}
                        <div ref={bottomRef} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chart">
              <Card>
                <CardContent className="p-3">
                  {run?.ticker ? (
                    <LightweightChart symbol={run.ticker} exchange="US" height={560} />
                  ) : (
                    <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function VerdictBadge({ v }: { v?: BacktestResult["verdict"] }) {
  if (!v) return null;
  const map = {
    right: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: TrendingUp, label: "Right" },
    wrong: { cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30", Icon: TrendingDown, label: "Wrong" },
    neutral: { cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30", Icon: Minus, label: "Neutral" },
    pending: { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: Activity, label: "Pending" },
  };
  const m = map[v];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" }) {
  const cls = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "red" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function EventRow({ event, data }: { event: string; data: unknown }) {
  if (event === "ping" || event === "chain_start") return null;

  const meta: Record<
    string,
    { label: string; Icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
  > = {
    run_started: { label: "Run started", Icon: PlayCircle, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
    llm_start: { label: "Claude thinking", Icon: Brain, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
    llm_end: { label: "Claude reply", Icon: Brain, color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-500/5" },
    tool_start: { label: "Tool call", Icon: Wrench, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
    tool_end: { label: "Tool result", Icon: Wrench, color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/5" },
    final_decision: { label: "Final decision", Icon: Sparkles, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    done: { label: "Done", Icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    error: { label: "Error", Icon: AlertCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  };
  const m = meta[event] ?? { label: event, Icon: Activity, color: "text-muted-foreground", bg: "bg-muted" };

  let preview = "";
  if (typeof data === "object" && data) {
    const d = data as Record<string, unknown>;
    preview =
      (d.text as string) ??
      (d.output as string) ??
      (d.input as string) ??
      (d.model as string) ??
      (d.message as string) ??
      JSON.stringify(d).slice(0, 400);
  } else {
    preview = String(data);
  }

  return (
    <div className="slide-in flex gap-3 rounded-xl border bg-card/50 p-3">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${m.bg}`}>
        <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-medium uppercase tracking-wider ${m.color}`}>
          {m.label}
        </div>
        <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80">
          {preview.slice(0, 1500)}
          {preview.length > 1500 && (
            <span className="text-muted-foreground"> ... +{preview.length - 1500} chars</span>
          )}
        </div>
      </div>
    </div>
  );
}
