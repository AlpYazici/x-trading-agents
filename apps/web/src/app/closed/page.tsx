"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { apiGet, apiPost, apiDelete, API_BASE, type ClosedPosition } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export default function ClosedPositionsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["closed"],
    queryFn: () => apiGet<ClosedPosition[]>("/portfolio/closed"),
  });

  async function del(id: number, sym: string) {
    if (!confirm(`Delete closed position ${sym}?`)) return;
    await apiDelete(`/portfolio/closed/${id}`);
    qc.invalidateQueries({ queryKey: ["closed"] });
    toast.success(`${sym} deleted`);
  }

  const totals = (data ?? []).reduce(
    (acc, c) => ({ pl: acc.pl + c.realized_pl_usd, count: acc.count + 1 }),
    { pl: 0, count: 0 }
  );
  const wins = (data ?? []).filter((c) => c.realized_pl_usd > 0).length;
  const losses = (data ?? []).filter((c) => c.realized_pl_usd < 0).length;
  const winRate = totals.count > 0 ? wins / totals.count : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Closed positions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Realized P/L history. CSV export for taxes.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`${API_BASE}/portfolio/closed/csv`}
            download
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>
          <AddClosedDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Realized P/L (USD)" value={fmt(totals.pl)} tone={totals.pl >= 0 ? "emerald" : "red"} />
        <Stat label="Closed positions" value={String(totals.count)} />
        <Stat label="Wins" value={String(wins)} tone="emerald" />
        <Stat label="Win rate" value={`${(winRate * 100).toFixed(1)}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All closed positions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Exchange</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>P/L</TableHead>
                <TableHead>P/L (USD)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.length ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    No closed positions yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {c.exchange}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.qty}</TableCell>
                    <TableCell>{c.entry_price.toFixed(2)}</TableCell>
                    <TableCell>{c.exit_price.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(c.opened_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(c.closed_at)}
                    </TableCell>
                    <TableCell
                      className={`font-medium ${c.realized_pl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      {c.realized_pl >= 0 ? "+" : ""}
                      {c.realized_pl.toFixed(2)} {c.currency}
                    </TableCell>
                    <TableCell
                      className={`font-medium ${c.realized_pl_usd >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      {c.realized_pl_usd >= 0 ? "+" : ""}
                      {fmt(c.realized_pl_usd)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => del(c.id, c.symbol)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "red";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tracking-tight ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function AddClosedDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    exchange: "US",
    qty: 0,
    entry_price: 0,
    exit_price: 0,
    currency: "USD",
    opened_at: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    closed_at: new Date().toISOString().slice(0, 10),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symbol || form.qty <= 0 || form.entry_price <= 0 || form.exit_price <= 0) return;
    setBusy(true);
    try {
      await apiPost("/portfolio/closed", {
        ...form,
        opened_at: new Date(form.opened_at).toISOString(),
        closed_at: new Date(form.closed_at).toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["closed"] });
      toast.success(`${form.symbol} added`);
      setOpen(false);
    } catch (e) {
      toast.error("Add failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />
          Log closed position
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a closed position</DialogTitle>
          <DialogDescription>Enter a position you closed (sold).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Exchange</Label>
              <select
                value={form.exchange}
                onChange={(e) => {
                  const ex = e.target.value;
                  setForm({ ...form, exchange: ex, currency: ex === "BIST" ? "TRY" : "USD" });
                }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="US">🇺🇸 US</option>
                <option value="BIST">🇹🇷 BIST</option>
                <option value="CRYPTO">₿ Crypto</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Symbol</Label>
              <Input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                placeholder="NVDA"
                className="font-mono"
                autoFocus
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input
                type="number"
                step="any"
                value={form.qty || ""}
                onChange={(e) => setForm({ ...form, qty: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entry</Label>
              <Input
                type="number"
                step="any"
                value={form.entry_price || ""}
                onChange={(e) => setForm({ ...form, entry_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Exit</Label>
              <Input
                type="number"
                step="any"
                value={form.exit_price || ""}
                onChange={(e) => setForm({ ...form, exit_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opened</Label>
              <Input
                type="date"
                value={form.opened_at}
                onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Closed</Label>
              <Input
                type="date"
                value={form.closed_at}
                onChange={(e) => setForm({ ...form, closed_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString();
}
