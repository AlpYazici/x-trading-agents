"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { apiPost, type Order } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Body = {
  symbol: string;
  side: "buy" | "sell";
  qty?: number;
  stop_price?: number;
  take_profit_price?: number;
};

type AssetClass = "stock" | "crypto";

const CRYPTO_CHIPS = ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "DOGE/USD"];

export function NewOrderDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assetClass, setAssetClass] = useState<AssetClass>("stock");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState<string>("");
  const [stop, setStop] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [autoSize, setAutoSize] = useState(true);

  const isCrypto = assetClass === "crypto";

  function switchAssetClass(next: AssetClass) {
    if (next === assetClass) return;
    setAssetClass(next);
    setSymbol("");
    setStop("");
    setTp("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setBusy(true);
    try {
      const cleanSym = symbol.trim().toUpperCase();
      const body: Body = {
        symbol: cleanSym,
        side,
      };
      if (!autoSize && qty) body.qty = parseFloat(qty);
      if (!isCrypto) {
        if (stop) body.stop_price = parseFloat(stop);
        if (tp) body.take_profit_price = parseFloat(tp);
      }

      const order = await apiPost<Order>("/trades/manual", body);
      if (order.status === "rejected") {
        toast.error("Order rejected by risk gate", {
          description: order.rejection_reason ?? "",
        });
      } else {
        toast.success(
          `${side.toUpperCase()} ${order.symbol} × ${order.qty} → ${order.status}`,
          { description: "See Trades for approval" }
        );
        setOpen(false);
        setSymbol("");
        setQty("");
        setStop("");
        setTp("");
      }
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      toast.error("Failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />
          New order
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New manual order</DialogTitle>
          <DialogDescription>
            Goes through the same risk gate.{" "}
            {isCrypto
              ? "Crypto: simple market order (no brackets)."
              : "Default: bracket order with stop & TP."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Asset class</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => switchAssetClass("stock")}
                className={`flex items-center justify-center rounded-lg border py-2 text-sm font-semibold transition ${
                  !isCrypto
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "hover:bg-accent"
                }`}
              >
                Stock
              </button>
              <button
                type="button"
                onClick={() => switchAssetClass("crypto")}
                className={`flex items-center justify-center rounded-lg border py-2 text-sm font-semibold transition ${
                  isCrypto
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "hover:bg-accent"
                }`}
              >
                Crypto
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Side</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition ${
                  side === "buy"
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "hover:bg-accent"
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition ${
                  side === "sell"
                    ? "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "hover:bg-accent"
                }`}
              >
                <TrendingDown className="h-4 w-4" />
                SELL
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sym">Symbol</Label>
            <Input
              id="sym"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={isCrypto ? "BTC/USD" : "AAPL"}
              autoFocus
              className="font-mono"
            />
            {isCrypto && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CRYPTO_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSymbol(c)}
                    className={`rounded-md border px-2 py-0.5 font-mono text-xs transition ${
                      symbol === c
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoSize}
                onChange={(e) => setAutoSize(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm font-normal">
                Auto-size (use risk limits — 2% per trade)
              </span>
            </Label>
            {!autoSize && (
              <Input
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={isCrypto ? "Quantity (fractional ok)" : "Quantity (shares)"}
              />
            )}
          </div>

          {side === "buy" && !isCrypto && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stop" className="text-xs">
                  Stop loss <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="stop"
                  type="number"
                  step="any"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  placeholder="auto"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp" className="text-xs">
                  Take profit <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="tp"
                  type="number"
                  step="any"
                  value={tp}
                  onChange={(e) => setTp(e.target.value)}
                  placeholder="auto"
                  className="font-mono"
                />
              </div>
            </div>
          )}

          {isCrypto && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-300">
              Crypto: GTC only, no margin, no shorting, no bracket orders.
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            ⚠ Mode: <span className="font-semibold">PAPER</span>. Manual approval still required —
            order will sit pending in Trades until you approve it.
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || !symbol.trim()}
              className={
                side === "buy"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-red-600 hover:bg-red-500"
              }
            >
              {busy ? "Sending..." : `${side === "buy" ? "Submit BUY" : "Submit SELL"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
