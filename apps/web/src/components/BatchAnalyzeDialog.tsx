"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketGroup } from "@/lib/userMarkets";
import { apiPost } from "@/lib/api";
import { toast } from "sonner";

const COST_PER_RUN = 0.2;
const MAX_BATCH = 20;

type BatchResponse = {
  run_ids: number[];
  started: number;
  failed: string[];
};

function parseManual(raw: string): string[] {
  return raw
    .split(/[\s,;\n]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function BatchAnalyzeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"watchlist" | "manual">("watchlist");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const { list } = useMarketGroup("stocks");

  const tickers = useMemo(() => {
    const raw =
      tab === "watchlist" ? Array.from(picked) : parseManual(manual);
    // Dedupe (case-insensitive) preserving order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of raw) {
      const u = t.toUpperCase();
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [tab, picked, manual]);

  const overLimit = tickers.length > MAX_BATCH;
  const cost = tickers.length * COST_PER_RUN;

  function toggle(symbol: string) {
    const next = new Set(picked);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setPicked(next);
  }

  function selectAll() {
    setPicked(new Set(list.map((m) => m.symbol.toUpperCase())));
  }

  function clearAll() {
    setPicked(new Set());
  }

  async function submit() {
    if (!tickers.length || overLimit) return;
    setBusy(true);
    try {
      const res = await apiPost<BatchResponse>("/runs/batch", { tickers });
      const failedNote =
        res.failed.length > 0 ? ` (${res.failed.length} failed)` : "";
      toast.success(`Started ${res.started} runs${failedNote}`);
      setOpen(false);
      router.push("/compare");
    } catch (e) {
      toast.error("Batch failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <Layers className="h-3.5 w-3.5" />
          Batch analyze
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch analyze</DialogTitle>
          <DialogDescription>
            Fire multiple agent runs in parallel. Max {MAX_BATCH} tickers per
            batch.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "watchlist" | "manual")}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="watchlist">From watchlist</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="watchlist" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {list.length} symbols in watchlist
              </Label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border p-2">
              {list.map((m) => {
                const sym = m.symbol.toUpperCase();
                const checked = picked.has(sym);
                return (
                  <label
                    key={sym}
                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition ${
                      checked ? "bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(sym)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-mono text-xs">{sym}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.label}
                    </span>
                  </label>
                );
              })}
              {list.length === 0 && (
                <div className="col-span-2 py-4 text-center text-xs text-muted-foreground">
                  Watchlist is empty.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-2">
            <Label htmlFor="manual-tickers">
              Tickers (comma or newline separated)
            </Label>
            <textarea
              id="manual-tickers"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              rows={6}
              placeholder="AAPL, MSFT, NVDA&#10;TSLA"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {tickers.length} ticker{tickers.length === 1 ? "" : "s"} ×
            {" "}~${COST_PER_RUN.toFixed(2)}
          </span>
          <span className="font-mono font-medium">
            ~${cost.toFixed(2)}
          </span>
        </div>

        {overLimit && (
          <p className="text-xs text-destructive">
            Exceeds max of {MAX_BATCH} tickers per batch.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={busy || tickers.length === 0 || overLimit}
            className="gap-2"
          >
            {busy ? "Starting..." : `Start batch (${tickers.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
