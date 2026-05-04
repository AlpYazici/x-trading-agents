"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { apiGet, apiDelete, type Holding } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TradingChart } from "@/components/TradingChart";
import { AllocationPie, PnlBars } from "@/components/PortfolioCharts";
import { AddHoldingDialog } from "@/components/AddHoldingDialog";
import { PortfolioTimeSeries } from "@/components/PortfolioTimeSeries";
import { toast } from "sonner";

export default function PortfolioPage() {
  const qc = useQueryClient();
  const { data: holdings } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => apiGet<Holding[]>("/holdings"),
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<Holding | null>(null);

  useEffect(() => {
    if (!selected && holdings?.length) setSelected(holdings[0]);
  }, [holdings, selected]);

  async function deleteHolding(id: number, sym: string) {
    if (!confirm(`Remove ${sym} from your portfolio?`)) return;
    await apiDelete(`/holdings/${id}`);
    toast.success(`${sym} removed`);
    qc.invalidateQueries({ queryKey: ["holdings"] });
    if (selected?.id === id) setSelected(null);
  }

  // totals
  const totalUsd = holdings?.reduce((s, h) => s + (h.market_value_usd ?? 0), 0) ?? 0;
  const totalPl =
    holdings?.reduce((s, h) => s + (h.pl && h.fx_rate ? h.pl * h.fx_rate : 0), 0) ?? 0;
  const totalCost = totalUsd - totalPl;
  const totalPlPct = totalCost > 0 ? totalPl / totalCost : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual holdings · live prices via yfinance · multi-currency aware
          </p>
        </div>
        <AddHoldingDialog />
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Total value" value={fmt(totalUsd)} sub="USD" />
        <Metric
          label="Total P/L"
          value={`${totalPl >= 0 ? "+" : ""}${fmt(totalPl)}`}
          sub={`${totalPlPct >= 0 ? "+" : ""}${(totalPlPct * 100).toFixed(2)}%`}
          tone={totalPl >= 0 ? "emerald" : "red"}
          Icon={totalPl >= 0 ? TrendingUp : TrendingDown}
        />
        <Metric label="Cost basis" value={fmt(totalCost)} sub="USD" />
        <Metric label="Holdings" value={String(holdings?.length ?? 0)} sub="positions" />
      </div>

      {/* Time-series — top */}
      <PortfolioTimeSeries />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationPie holdings={holdings ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">P/L per holding (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <PnlBars holdings={holdings ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Selected chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pick a holding</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!holdings?.length ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                No holdings yet.
              </div>
            ) : (
              <ul className="divide-y">
                {holdings.map((h) => {
                  const plUsd = h.pl && h.fx_rate ? h.pl * h.fx_rate : 0;
                  return (
                    <li key={h.id}>
                      <button
                        onClick={() => setSelected(h)}
                        className={`flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-accent/50 ${
                          selected?.id === h.id ? "bg-accent/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <ExchangeChip ex={h.exchange} />
                          <div>
                            <div className="font-semibold">{h.symbol}</div>
                            <div className="text-xs text-muted-foreground">
                              {h.qty.toLocaleString()} @ {ccy(h.entry_price, h.currency)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {h.market_value_usd != null ? fmt(h.market_value_usd) : "—"}
                          </div>
                          <div
                            className={`text-xs font-medium ${
                              plUsd >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {plUsd >= 0 ? "+" : ""}
                            {fmt(plUsd)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {selected ? `${selected.symbol} · ${selected.exchange}` : "Live chart"}
            </CardTitle>
            {selected && (
              <Badge variant="outline" className="font-mono">
                {selected.exchange === "BIST"
                  ? `${selected.symbol}.IS`
                  : selected.exchange === "CRYPTO"
                    ? `${selected.symbol}-USD`
                    : selected.symbol}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {selected ? (
              <TradingChart symbol={selected.symbol} exchange={selected.exchange} height={460} />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Select a holding on the left
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All holdings</CardTitle>
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
                <TableHead>Current</TableHead>
                <TableHead>Market value</TableHead>
                <TableHead>USD value</TableHead>
                <TableHead>P/L</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!holdings?.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    No holdings. Click "Add holding".
                  </TableCell>
                </TableRow>
              ) : (
                holdings.map((h) => {
                  const plUsd = h.pl && h.fx_rate ? h.pl * h.fx_rate : 0;
                  return (
                    <TableRow key={h.id} onClick={() => setSelected(h)} className="cursor-pointer">
                      <TableCell className="font-semibold">{h.symbol}</TableCell>
                      <TableCell>
                        <ExchangeChip ex={h.exchange} />
                      </TableCell>
                      <TableCell>{h.qty.toLocaleString()}</TableCell>
                      <TableCell>{ccy(h.entry_price, h.currency)}</TableCell>
                      <TableCell>{h.current_price != null ? ccy(h.current_price, h.currency) : "—"}</TableCell>
                      <TableCell>{h.market_value != null ? ccy(h.market_value, h.currency) : "—"}</TableCell>
                      <TableCell>{h.market_value_usd != null ? fmt(h.market_value_usd) : "—"}</TableCell>
                      <TableCell
                        className={`font-medium ${
                          plUsd >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {plUsd >= 0 ? "+" : ""}
                        {fmt(plUsd)}
                        {h.pl_pct != null && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({(h.pl_pct * 100).toFixed(2)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHolding(h.id, h.symbol);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
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
  Icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "emerald" | "red";
  Icon?: React.ComponentType<{ className?: string }>;
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
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          {Icon && <Icon className={`h-4 w-4 ${valueCls}`} />}
        </div>
        <div className={`mt-2 text-2xl font-semibold tracking-tight ${valueCls}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function ExchangeChip({ ex }: { ex: string }) {
  const m: Record<string, string> = { US: "🇺🇸 US", BIST: "🇹🇷 BIST", CRYPTO: "₿ Crypto" };
  return (
    <Badge variant="secondary" className="text-[10px]">
      {m[ex] ?? ex}
    </Badge>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

function ccy(n: number, c: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);
}
