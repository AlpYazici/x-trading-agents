"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Brain,
  Play,
  TrendingUp,
  Activity,
  Zap,
} from "lucide-react";
import { apiGet, apiPost, type Run } from "@/lib/api";
import { useWatchlist } from "@/lib/watchlist";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TradingChart } from "@/components/TradingChart";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";
import { toast } from "sonner";

export default function AgentPage() {
  const qc = useQueryClient();
  const { list, add, remove } = useWatchlist();
  const [newSym, setNewSym] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [autoTrade, setAutoTrade] = useState(false);

  const { data: runs } = useQuery({
    queryKey: ["runs"],
    queryFn: () => apiGet<Run[]>("/runs?limit=20"),
    refetchInterval: 3_000,
  });

  const activeRun = runs?.find((r) => r.status === "running");

  async function analyzeOne(sym: string) {
    try {
      const r = await apiPost<{ run_id: number }>("/runs", { ticker: sym });
      toast.success(`Analyzing ${sym}`, { description: `Run #${r.run_id}` });
      qc.invalidateQueries({ queryKey: ["runs"] });
    } catch (e) {
      toast.error(`Failed to start ${sym}`, { description: String(e) });
    }
  }

  async function analyzeAll() {
    if (!confirm(`Analyze all ${list.length} tickers? Cost ~$${(list.length * 0.2).toFixed(2)}`)) return;
    for (const sym of list) {
      try {
        await apiPost("/runs", { ticker: sym });
      } catch {}
    }
    toast.success(`Queued ${list.length} runs`);
    qc.invalidateQueries({ queryKey: ["runs"] });
  }

  function addSym(e: React.FormEvent) {
    e.preventDefault();
    add(newSym);
    setNewSym("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Agentic trading
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Watchlist & Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tickers the multi-agent system tracks. Analyze on-demand or schedule.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <Label htmlFor="auto" className="text-sm font-medium">
              Auto-trade
            </Label>
          </div>
          <Switch
            id="auto"
            checked={autoTrade}
            onCheckedChange={(v) => {
              if (v) {
                if (!confirm("Auto-trade is OFF by safety policy. This toggle is UI-only — server still requires manual approval. Continue?")) return;
              }
              setAutoTrade(v);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT: watchlist */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Watchlist</CardTitle>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <CardDescription className="text-xs">Stored locally in your browser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={addSym} className="flex gap-2">
                <Input
                  value={newSym}
                  onChange={(e) => setNewSym(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Plus className="h-4 w-4" />
                </Button>
              </form>

              <Button
                onClick={analyzeAll}
                disabled={list.length === 0}
                className="w-full gap-2 bg-gradient-to-br from-violet-600 to-indigo-600"
                size="sm"
              >
                <Play className="h-3.5 w-3.5" />
                Analyze all ({list.length})
              </Button>

              <div className="space-y-1 pt-2">
                {list.map((sym) => (
                  <div
                    key={sym}
                    className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
                      selected === sym ? "border-primary/40 bg-accent/40" : "hover:bg-accent/30"
                    }`}
                  >
                    <button
                      onClick={() => setSelected(sym)}
                      className="flex-1 text-left text-sm font-semibold"
                    >
                      {sym}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => analyzeOne(sym)}
                    >
                      <Brain className="mr-1 h-3 w-3" />
                      Analyze
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 transition group-hover:opacity-100"
                      onClick={() => remove(sym)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    No tickers. Add one above.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {activeRun && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <Activity className="h-3.5 w-3.5 pulse-soft" />
                  Live agent
                </div>
                <Link
                  href={`/runs/${activeRun.id}`}
                  className="text-base font-semibold hover:underline"
                >
                  {activeRun.ticker}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Run #{activeRun.id} · {activeRun.trade_date}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: chart + decisions */}
        <div className="space-y-4 lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{selected}</CardTitle>
                  <CardDescription>Live chart · TradingView</CardDescription>
                </div>
                <Button onClick={() => analyzeOne(selected)} size="sm" className="gap-2">
                  <Brain className="h-3.5 w-3.5" />
                  Analyze {selected}
                </Button>
              </CardHeader>
              <CardContent>
                <TradingChart symbol={selected} exchange="US" height={420} />
              </CardContent>
            </Card>
          ) : (
            <Card className="flex h-64 items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                <TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Select a ticker to see live chart
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent decisions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!runs?.length ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No decisions yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/runs/${r.id}`}
                        className="flex items-center justify-between px-5 py-3 text-sm transition hover:bg-accent/50"
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
        </div>
      </div>
    </div>
  );
}
