"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiPost, type Holding, type HoldingIn } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";

export function AddHoldingDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<HoldingIn>({
    symbol: "",
    exchange: "US",
    qty: 0,
    entry_price: 0,
    currency: "USD",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symbol || form.qty <= 0 || form.entry_price <= 0) return;
    setBusy(true);
    try {
      await apiPost<Holding>("/holdings", form);
      toast.success(`${form.symbol} added`);
      qc.invalidateQueries({ queryKey: ["holdings"] });
      setOpen(false);
      setForm({ symbol: "", exchange: "US", qty: 0, entry_price: 0, currency: "USD" });
    } catch (e) {
      toast.error("Add failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  function setExchange(ex: "US" | "BIST" | "CRYPTO") {
    const ccy = ex === "BIST" ? "TRY" : "USD";
    setForm({ ...form, exchange: ex, currency: ccy });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />
          Add holding
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add holding</DialogTitle>
          <DialogDescription>
            Enter a position you own. Live prices fetched from yfinance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Exchange</Label>
            <div className="flex gap-2">
              {(["US", "BIST", "CRYPTO"] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setExchange(ex)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    form.exchange === ex
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  {ex === "US" ? "🇺🇸 US" : ex === "BIST" ? "🇹🇷 BIST" : "₿ Crypto"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sym">Symbol</Label>
              <Input
                id="sym"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                placeholder={
                  form.exchange === "BIST"
                    ? "RYGYO"
                    : form.exchange === "CRYPTO"
                      ? "BTC"
                      : "NVDA"
                }
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ccy">Currency</Label>
              <select
                id="ccy"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="USD">USD</option>
                <option value="TRY">TRY (₺)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                step="any"
                value={form.qty || ""}
                onChange={(e) => setForm({ ...form, qty: parseFloat(e.target.value) || 0 })}
                placeholder="50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep">Entry price</Label>
              <Input
                id="ep"
                type="number"
                step="any"
                value={form.entry_price || ""}
                onChange={(e) => setForm({ ...form, entry_price: parseFloat(e.target.value) || 0 })}
                placeholder="167.52"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || !form.symbol || form.qty <= 0 || form.entry_price <= 0}
              className="gap-2"
            >
              {busy ? "Adding..." : "Add holding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
