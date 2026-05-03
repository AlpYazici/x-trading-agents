"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
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
import {
  useMarketGroup,
  classifySymbol,
  GROUP_LABELS,
  type GroupKey,
  type MarketDef,
} from "@/lib/userMarkets";
import { apiGet } from "@/lib/api";
import { toast } from "sonner";

const SUGGESTIONS: Record<GroupKey, { label: string; symbol: string; unit?: string }[]> = {
  stocks: [
    { label: "Apple", symbol: "AAPL" },
    { label: "Microsoft", symbol: "MSFT" },
    { label: "Tesla", symbol: "TSLA" },
    { label: "Coinbase", symbol: "COIN" },
    { label: "Berkshire", symbol: "BRK-B" },
  ],
  crypto: [
    { label: "Bitcoin", symbol: "BTC-USD" },
    { label: "Ethereum", symbol: "ETH-USD" },
    { label: "Solana", symbol: "SOL-USD" },
    { label: "XRP", symbol: "XRP-USD" },
    { label: "Cardano", symbol: "ADA-USD" },
    { label: "Dogecoin", symbol: "DOGE-USD" },
    { label: "Avalanche", symbol: "AVAX-USD" },
  ],
  indices: [
    { label: "Nasdaq 100", symbol: "^NDX" },
    { label: "Dow Jones", symbol: "^DJI" },
    { label: "Russell 2000", symbol: "^RUT" },
    { label: "VIX", symbol: "^VIX" },
    { label: "FTSE 100", symbol: "^FTSE" },
    { label: "DAX", symbol: "^GDAXI" },
    { label: "Nikkei 225", symbol: "^N225" },
  ],
  currencies: [
    { label: "USD/JPY", symbol: "JPY=X" },
    { label: "AUD/USD", symbol: "AUDUSD=X" },
    { label: "USD/CAD", symbol: "CAD=X" },
    { label: "USD/CHF", symbol: "CHF=X" },
  ],
  commodities: [
    { label: "Brent", symbol: "BZ=F", unit: "$/bbl" },
    { label: "Platinum", symbol: "PL=F", unit: "$/oz" },
    { label: "Palladium", symbol: "PA=F", unit: "$/oz" },
    { label: "Wheat", symbol: "ZW=F", unit: "¢/bu" },
    { label: "Corn", symbol: "ZC=F", unit: "¢/bu" },
    { label: "Coffee", symbol: "KC=F", unit: "¢/lb" },
  ],
};

type Props = {
  defaultGroup?: GroupKey;
  trigger?: React.ReactNode;
};

export function AddMarketDialog({ defaultGroup, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<GroupKey>(defaultGroup ?? "stocks");
  const [symbol, setSymbol] = useState("");
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);

  // Use one hook per possible group so add() routes correctly.
  const stocks = useMarketGroup("stocks");
  const indices = useMarketGroup("indices");
  const currencies = useMarketGroup("currencies");
  const commodities = useMarketGroup("commodities");
  const crypto = useMarketGroup("crypto");
  const groups = { stocks, crypto, indices, currencies, commodities };

  function onSymbolChange(v: string) {
    setSymbol(v.toUpperCase());
    // auto-detect group only if user hasn't manually selected
    if (!defaultGroup) {
      setGroup(classifySymbol(v));
    }
  }

  function pickSuggestion(s: { label: string; symbol: string; unit?: string }) {
    setSymbol(s.symbol);
    setLabel(s.label);
    if (s.unit) setUnit(s.unit);
    setGroup(classifySymbol(s.symbol));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setBusy(true);
    try {
      // Validate symbol returns data
      const q = await apiGet<{ last: number | null }>(
        `/ohlc/quote?symbol=${encodeURIComponent(symbol)}&exchange=US`
      );
      if (q.last == null) {
        toast.error(`No data for ${symbol}`, {
          description: "Symbol not found on yfinance. Check spelling.",
        });
        return;
      }
      const item: MarketDef = {
        symbol: symbol.toUpperCase(),
        label: label.trim() || symbol.toUpperCase(),
        exchange: "US",
        unit: unit.trim() || undefined,
      };
      const ok = groups[group].add(item);
      if (ok) {
        toast.success(`${item.label} added to ${GROUP_LABELS[group]}`);
        setOpen(false);
        setSymbol("");
        setLabel("");
        setUnit("");
      } else {
        toast.warning(`${item.symbol} already in ${GROUP_LABELS[group]}`);
      }
    } catch (e) {
      toast.error("Add failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {trigger ?? (
          <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" />
            Add to dashboard
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to dashboard</DialogTitle>
          <DialogDescription>
            Add a stock, index, currency, or commodity. Auto-detected from symbol pattern.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Group</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    group === g
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Suggestions</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS[group].map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {s.label}
                  <span className="ml-1 font-mono text-[10px] opacity-60">{s.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sym">Symbol</Label>
              <Input
                id="sym"
                value={symbol}
                onChange={(e) => onSymbolChange(e.target.value)}
                placeholder={
                  group === "stocks"
                    ? "NVDA"
                    : group === "indices"
                      ? "^NDX"
                      : group === "currencies"
                        ? "EURUSD=X"
                        : "BZ=F"
                }
                autoFocus
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab">Label (optional)</Label>
              <Input
                id="lab"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={symbol || "Display name"}
              />
            </div>
          </div>

          {(group === "currencies" || group === "commodities") && (
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit (optional)</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={group === "commodities" ? "$/bbl" : "₺"}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={busy || !symbol.trim()} className="gap-2">
              {busy ? "Validating..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
