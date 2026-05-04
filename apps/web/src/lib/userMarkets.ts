"use client";
import { useEffect, useState, useCallback } from "react";

export type MarketDef = {
  label: string;
  symbol: string;
  exchange: string;
  unit?: string;
};

export type GroupKey = "stocks" | "crypto" | "indices" | "currencies" | "commodities";

const KEYS: Record<GroupKey, string> = {
  stocks: "tac_grp_stocks_v1",
  crypto: "tac_grp_crypto_v1",
  indices: "tac_grp_indices_v1",
  currencies: "tac_grp_currencies_v1",
  commodities: "tac_grp_commodities_v1",
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  stocks: "Stocks",
  crypto: "Crypto",
  indices: "Indices",
  currencies: "Currencies",
  commodities: "Commodities",
};

export const DEFAULTS: Record<GroupKey, MarketDef[]> = {
  stocks: [
    { label: "NVDA", symbol: "NVDA", exchange: "US" },
    { label: "MSFT", symbol: "MSFT", exchange: "US" },
    { label: "GOOGL", symbol: "GOOGL", exchange: "US" },
    { label: "AMZN", symbol: "AMZN", exchange: "US" },
    { label: "META", symbol: "META", exchange: "US" },
    { label: "AAPL", symbol: "AAPL", exchange: "US" },
    { label: "TSLA", symbol: "TSLA", exchange: "US" },
    { label: "ORCL", symbol: "ORCL", exchange: "US" },
    { label: "MU", symbol: "MU", exchange: "US" },
    { label: "PLTR", symbol: "PLTR", exchange: "US" },
    { label: "SONY", symbol: "SONY", exchange: "US" },
  ],
  crypto: [
    { label: "Bitcoin",  symbol: "BTC-USD", exchange: "CRYPTO", unit: "USD" },
    { label: "Ethereum", symbol: "ETH-USD", exchange: "CRYPTO", unit: "USD" },
    { label: "Solana",   symbol: "SOL-USD", exchange: "CRYPTO", unit: "USD" },
    { label: "XRP",      symbol: "XRP-USD", exchange: "CRYPTO", unit: "USD" },
    { label: "Cardano",  symbol: "ADA-USD", exchange: "CRYPTO", unit: "USD" },
  ],
  indices: [
    { label: "S&P 500", symbol: "^GSPC", exchange: "US" },
    { label: "BIST 100", symbol: "XU100.IS", exchange: "US" },
    { label: "DXY", symbol: "DX-Y.NYB", exchange: "US" },
  ],
  currencies: [
    { label: "EUR/USD", symbol: "EURUSD=X", exchange: "US" },
    { label: "GBP/USD", symbol: "GBPUSD=X", exchange: "US" },
    { label: "USD/TRY", symbol: "USDTRY=X", exchange: "US", unit: "₺" },
    { label: "EUR/TRY", symbol: "EURTRY=X", exchange: "US", unit: "₺" },
    { label: "GBP/TRY", symbol: "GBPTRY=X", exchange: "US", unit: "₺" },
  ],
  commodities: [
    { label: "Crude Oil", symbol: "CL=F", exchange: "US", unit: "$/bbl" },
    { label: "Natural Gas", symbol: "NG=F", exchange: "US", unit: "$/MMBtu" },
    { label: "Gold", symbol: "GC=F", exchange: "US", unit: "$/oz" },
    { label: "Silver", symbol: "SI=F", exchange: "US", unit: "$/oz" },
    { label: "Copper", symbol: "HG=F", exchange: "US", unit: "$/lb" },
    { label: "Uranium", symbol: "URA", exchange: "US", unit: "ETF" },
  ],
};

function load(key: string, fallback: MarketDef[]): MarketDef[] {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return fallback;
}

export function useMarketGroup(group: GroupKey) {
  const [list, setList] = useState<MarketDef[]>([]);
  useEffect(() => {
    setList(load(KEYS[group], DEFAULTS[group]));
  }, [group]);

  const persist = useCallback(
    (next: MarketDef[]) => {
      setList(next);
      localStorage.setItem(KEYS[group], JSON.stringify(next));
    },
    [group]
  );

  const add = useCallback(
    (item: MarketDef) => {
      const exists = list.some(
        (m) => m.symbol.toUpperCase() === item.symbol.toUpperCase()
      );
      if (exists) return false;
      persist([...list, item]);
      return true;
    },
    [list, persist]
  );

  const remove = useCallback(
    (symbol: string) => {
      persist(list.filter((m) => m.symbol !== symbol));
    },
    [list, persist]
  );

  const reset = useCallback(() => {
    persist(DEFAULTS[group]);
  }, [group, persist]);

  const reorder = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      const next = [...list];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      persist(next);
    },
    [list, persist]
  );

  return { list, add, remove, reset, reorder };
}

/** Auto-classify a symbol into a group based on common patterns. */
export function classifySymbol(symbol: string): GroupKey {
  const s = symbol.toUpperCase().trim();
  if (s.startsWith("^") || s.endsWith(".IS") || s === "DX-Y.NYB") return "indices";
  if (s.endsWith("=X")) return "currencies";
  if (s.endsWith("=F")) return "commodities";
  return "stocks";
}
