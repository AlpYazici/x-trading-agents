"use client";
import { useEffect, useState } from "react";

const KEY = "tac_watchlist_v2";

const DEFAULTS = [
  "NVDA",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "AAPL",
  "TSLA",
  "ORCL",
  "MU",
  "PLTR",
  "SONY",
];

export function useWatchlist() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        setList(JSON.parse(raw));
        return;
      } catch {}
    }
    setList(DEFAULTS);
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
  }, []);

  function persist(next: string[]) {
    setList(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function add(sym: string) {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    if (list.includes(s)) return;
    persist([...list, s]);
  }
  function remove(sym: string) {
    persist(list.filter((s) => s !== sym));
  }

  return { list, add, remove };
}
