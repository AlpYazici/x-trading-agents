// Production: use /api (Next.js rewrites in next.config.ts proxy to backend).
// Development: NEXT_PUBLIC_API_BASE override hits backend directly (e.g. http://127.0.0.1:8001).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "/api";

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export type Run = {
  id: number;
  ticker: string;
  trade_date: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  final_decision: string | null;
  signal: string | null;
  error: string | null;
};

export type Order = {
  id: number;
  run_id: number | null;
  alpaca_order_id: string | null;
  symbol: string;
  side: string;
  qty: number;
  order_class: string;
  entry_price: number | null;
  stop_price: number | null;
  take_profit_price: number | null;
  status: string;
  submitted_at: string | null;
  filled_at: string | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
  paper: boolean;
  rejection_reason: string | null;
  created_at: string;
};

export type Portfolio = {
  account: {
    configured: boolean;
    paper?: boolean;
    cash?: number;
    equity?: number;
    buying_power?: number;
    pattern_day_trader?: boolean;
    daytrade_count?: number;
  };
  positions: {
    symbol: string;
    qty: number;
    avg_entry_price: number;
    current_price: number | null;
    market_value: number | null;
    unrealized_pl: number | null;
    unrealized_plpc: number | null;
    side: string;
  }[];
};

export type Safety = {
  kill_switch: { engaged: boolean; reason: string | null; engaged_at: string | null };
  live_mode: boolean;
  manual_approval: boolean;
  limits: Record<string, number>;
};

export type Holding = {
  id: number;
  symbol: string;
  exchange: "US" | "BIST" | "CRYPTO";
  qty: number;
  entry_price: number;
  currency: "USD" | "TRY" | "EUR";
  notes: string | null;
  current_price: number | null;
  market_value: number | null;
  market_value_usd: number | null;
  pl: number | null;
  pl_pct: number | null;
  fx_rate: number | null;
};

export type HoldingIn = {
  symbol: string;
  exchange: string;
  qty: number;
  entry_price: number;
  currency: string;
  notes?: string;
};

export async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
}

export type Snapshot = {
  ts: string;
  total_usd: number;
  total_pl_usd: number;
  holdings_count: number;
};

export type ClosedPosition = {
  id: number;
  symbol: string;
  exchange: string;
  qty: number;
  entry_price: number;
  exit_price: number;
  currency: string;
  opened_at: string;
  closed_at: string;
  realized_pl: number;
  realized_pl_usd: number;
  fx_rate: number;
  notes: string | null;
};

export type NewsItem = {
  title: string;
  summary: string;
  url: string;
  publisher: string;
  published_at: string | number | null;
  thumbnail: string | null;
  symbol?: string;
};

export type EarningsItem = {
  symbol: string;
  next_earnings: string | null;
  eps_estimate: number | null;
  eps_low: number | null;
  eps_high: number | null;
  revenue_estimate: number | null;
};

export type SectorETF = { label: string; symbol: string };

export type InsiderTrade = {
  source: "house" | "senate" | "corporate";
  person: string | null;
  role: string;
  ticker: string;
  transaction_type: string; // "buy" | "sell" | other
  amount_min: number | null;
  amount_max: number | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  comment: string | null;
};
