"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Brain, ArrowRight } from "lucide-react";
import Link from "next/link";
import { apiGet, apiPost, type Order } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewOrderDialog } from "@/components/NewOrderDialog";
import { toast } from "sonner";

export default function TradesPage() {
  const qc = useQueryClient();
  const { data: orders } = useQuery({
    queryKey: ["trades"],
    queryFn: () => apiGet<Order[]>("/trades?limit=200"),
    refetchInterval: 3_000,
  });

  async function approve(id: number) {
    if (!confirm(`Approve and submit order #${id} to broker?`)) return;
    try {
      await apiPost(`/trades/${id}/approve`);
      toast.success("Order submitted");
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      toast.error("Approve failed", { description: String(e) });
    }
  }

  async function reject(id: number) {
    const reason = window.prompt("Reject reason?", "user rejected");
    if (reason === null) return;
    await apiPost(`/trades/${id}/reject`, { reason });
    qc.invalidateQueries({ queryKey: ["trades"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Trades</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual orders + agent-staged orders. All bracket-ordered with stop & TP. Paper mode.
          </p>
        </div>
        <NewOrderDialog />
      </div>

      {/* How trading works */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <Brain className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">From an agent debate</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Run a debate, open the run, click <span className="font-semibold">Stage order</span> →
                  appears here as <span className="font-mono text-[11px]">pending_approval</span>.
                </p>
                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Start a debate <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Direct manual order</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click <span className="font-semibold">+ New order</span> top-right, pick side & symbol,
                  risk gate sizes it (or override qty). Then approve below to submit to Alpaca.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Stop</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orders?.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-muted-foreground">{o.id}</TableCell>
                    <TableCell>
                      {o.run_id != null ? (
                        <a className="text-primary hover:underline" href={`/runs/${o.run_id}`}>
                          #{o.run_id}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{o.symbol}</TableCell>
                    <TableCell><SideBadge side={o.side} /></TableCell>
                    <TableCell>{o.qty}</TableCell>
                    <TableCell>{o.entry_price?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-red-600 dark:text-red-400">{o.stop_price?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-emerald-600 dark:text-emerald-400">{o.take_profit_price?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell><OrderStatus status={o.status} /></TableCell>
                    <TableCell className="text-xs">
                      <span className={o.paper ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                        {o.paper ? "paper" : "LIVE"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{o.rejection_reason ?? ""}</TableCell>
                    <TableCell>
                      {o.status === "pending_approval" && (
                        <div className="flex gap-1">
                          <Button onClick={() => approve(o.id)} size="sm" variant="default" className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-500">
                            <Check className="h-3 w-3" /> Approve
                          </Button>
                          <Button onClick={() => reject(o.id)} size="icon" variant="ghost" className="h-7 w-7">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
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

function SideBadge({ side }: { side: string }) {
  const cls =
    side === "buy" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" :
    side === "sell" ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20" :
    "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`uppercase ${cls}`}>{side}</Badge>;
}

function OrderStatus({ status }: { status: string }) {
  const m: Record<string, string> = {
    pending_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
    approved: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20",
    submitted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    filled: "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20",
    hold: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={m[status] ?? "bg-muted"}>{status}</Badge>;
}
