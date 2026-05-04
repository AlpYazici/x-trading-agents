"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  TrendingUp,
  Globe,
  Users,
  ExternalLink,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Profile = {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  website?: string | null;
  exchange?: string | null;
  currency?: string | null;
  summary?: string | null;
  employees?: number | null;
  market_cap?: number | null;
  enterprise_value?: number | null;
  pe_trailing?: number | null;
  pe_forward?: number | null;
  ps_trailing?: number | null;
  pb?: number | null;
  ev_ebitda?: number | null;
  ev_revenue?: number | null;
  peg?: number | null;
  profit_margin?: number | null;
  operating_margin?: number | null;
  gross_margin?: number | null;
  ebitda_margin?: number | null;
  roe?: number | null;
  roa?: number | null;
  debt_to_equity?: number | null;
  current_ratio?: number | null;
  quick_ratio?: number | null;
  total_cash?: number | null;
  total_debt?: number | null;
  free_cashflow?: number | null;
  operating_cashflow?: number | null;
  revenue_growth?: number | null;
  earnings_growth?: number | null;
  dividend_yield?: number | null;
  dividend_rate?: number | null;
  payout_ratio?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  fifty_day_avg?: number | null;
  two_hundred_day_avg?: number | null;
  beta?: number | null;
  target_mean?: number | null;
  target_low?: number | null;
  target_high?: number | null;
  recommendation?: string | null;
  analyst_count?: number | null;
  shares_outstanding?: number | null;
  float_shares?: number | null;
  short_ratio?: number | null;
  short_percent_of_float?: number | null;
  error?: string;
};

type FinancialPeriod = {
  date: string;
  "Total Revenue"?: number | null;
  "Gross Profit"?: number | null;
  "Operating Income"?: number | null;
  "Net Income"?: number | null;
  EBITDA?: number | null;
  "Basic EPS"?: number | null;
};

type Financials = {
  symbol: string;
  annual: FinancialPeriod[];
  quarterly: FinancialPeriod[];
  error?: string;
};

export function CompanyProfile({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: string;
}) {
  const { data: profile, isLoading: pLoading } = useQuery({
    queryKey: ["profile", symbol, exchange],
    queryFn: () =>
      apiGet<Profile>(
        `/markets/profile?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`
      ),
    enabled: !!symbol,
    staleTime: 60 * 60 * 1000,
  });

  const { data: financials, isLoading: fLoading } = useQuery({
    queryKey: ["financials", symbol, exchange],
    queryFn: () =>
      apiGet<Financials>(
        `/markets/financials?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`
      ),
    enabled: !!symbol,
    staleTime: 12 * 60 * 60 * 1000,
  });

  if (pLoading) {
    return (
      <div className="rounded-xl border bg-card/40 p-6 text-sm text-muted-foreground">
        Loading company info...
      </div>
    );
  }

  if (!profile || profile.error || !profile.name) {
    return null;
  }

  return (
    <div className="space-y-4">
      <CompanyHeader profile={profile} />
      <KeyRatios profile={profile} />
      <FinancialsCharts financials={financials} loading={fLoading} />
      <AnalystAndPriceRefs profile={profile} />
    </div>
  );
}

function CompanyHeader({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {profile.sector ?? "—"}
              {profile.industry && (
                <>
                  <span>·</span>
                  <span>{profile.industry}</span>
                </>
              )}
              {profile.country && (
                <>
                  <span>·</span>
                  <Globe className="h-3 w-3" />
                  <span>{profile.country}</span>
                </>
              )}
            </div>
            <div className="mt-1 text-lg font-semibold">{profile.name}</div>
            {profile.employees != null && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {profile.employees.toLocaleString("en-US")} employees
              </div>
            )}
          </div>
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              Website
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {profile.summary && (
          <p className="line-clamp-4 text-xs leading-relaxed text-foreground/75">
            {profile.summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function KeyRatios({ profile }: { profile: Profile }) {
  const valuation = [
    { label: "Market Cap", value: bigFmt(profile.market_cap, profile.currency ?? "USD") },
    { label: "Enterprise Value", value: bigFmt(profile.enterprise_value, profile.currency ?? "USD") },
    { label: "P/E (TTM)", value: numFmt(profile.pe_trailing) },
    { label: "P/E (Fwd)", value: numFmt(profile.pe_forward) },
    { label: "P/S", value: numFmt(profile.ps_trailing) },
    { label: "P/B", value: numFmt(profile.pb) },
    { label: "EV/EBITDA", value: numFmt(profile.ev_ebitda) },
    { label: "PEG", value: numFmt(profile.peg) },
  ];
  const profitability = [
    { label: "Gross margin", value: pctFmt(profile.gross_margin) },
    { label: "Operating margin", value: pctFmt(profile.operating_margin) },
    { label: "Profit margin", value: pctFmt(profile.profit_margin) },
    { label: "EBITDA margin", value: pctFmt(profile.ebitda_margin) },
    { label: "ROE", value: pctFmt(profile.roe) },
    { label: "ROA", value: pctFmt(profile.roa) },
    { label: "Revenue growth", value: pctFmt(profile.revenue_growth) },
    { label: "Earnings growth", value: pctFmt(profile.earnings_growth) },
  ];
  const balance = [
    { label: "Cash", value: bigFmt(profile.total_cash, profile.currency ?? "USD") },
    { label: "Debt", value: bigFmt(profile.total_debt, profile.currency ?? "USD") },
    { label: "Free CF", value: bigFmt(profile.free_cashflow, profile.currency ?? "USD") },
    { label: "Op. CF", value: bigFmt(profile.operating_cashflow, profile.currency ?? "USD") },
    { label: "D/E", value: numFmt(profile.debt_to_equity, 1) },
    { label: "Current ratio", value: numFmt(profile.current_ratio) },
    { label: "Dividend yield", value: pctFmt(profile.dividend_yield) },
    { label: "Payout ratio", value: pctFmt(profile.payout_ratio) },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <RatioCard title="Valuation" rows={valuation} />
      <RatioCard title="Profitability" rows={profitability} />
      <RatioCard title="Balance & Cash" rows={balance} />
    </div>
  );
}

function RatioCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0">
              <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className="font-mono text-xs font-semibold tabular-nums">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function FinancialsCharts({
  financials,
  loading,
}: {
  financials: Financials | undefined;
  loading: boolean;
}) {
  const [period, setPeriod] = useState<"quarterly" | "annual">("quarterly");

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading financials...
        </CardContent>
      </Card>
    );
  }

  const data = financials?.[period] ?? [];
  if (!data.length) return null;

  const metrics: { key: keyof FinancialPeriod; label: string; color: string }[] = [
    { key: "Total Revenue",     label: "Revenue",          color: "#8b5cf6" },
    { key: "Gross Profit",      label: "Gross Profit",     color: "#06b6d4" },
    { key: "Operating Income",  label: "Operating Income", color: "#3b82f6" },
    { key: "Net Income",        label: "Net Income",       color: "#10b981" },
    { key: "EBITDA",            label: "EBITDA",           color: "#f59e0b" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Financials
        </CardTitle>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {(["quarterly", "annual"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {metrics.map((m) => {
          const series = data
            .map((d) => ({ date: d.date, value: (d[m.key] as number | null) ?? null }))
            .filter((d) => d.value != null) as { date: string; value: number }[];
          if (!series.length) return null;
          return (
            <BarSeries
              key={m.key as string}
              label={m.label}
              color={m.color}
              data={series}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function BarSeries({
  label,
  color,
  data,
}: {
  label: string;
  color: string;
  data: { date: string; value: number }[];
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)));
  const last = data[data.length - 1].value;
  const prev = data.length >= 2 ? data[data.length - 2].value : null;
  const yoyData = data.length >= 5 ? data[data.length - 5].value : null;
  const qoq = prev ? (last - prev) / Math.abs(prev) : null;
  const yoy = yoyData ? (last - yoyData) / Math.abs(yoyData) : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {bigFmt(last, "USD")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {qoq != null && (
            <span className={qoq >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              QoQ {qoq >= 0 ? "+" : ""}{(qoq * 100).toFixed(1)}%
            </span>
          )}
          {yoy != null && (
            <span className={yoy >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              YoY {yoy >= 0 ? "+" : ""}{(yoy * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {data.map((d, i) => {
          const h = max ? (Math.abs(d.value) / max) * 100 : 0;
          const negative = d.value < 0;
          return (
            <div
              key={d.date + i}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${d.date}: ${bigFmt(d.value, "USD")}`}
            >
              <div
                className="w-full rounded-t transition group-hover:opacity-80"
                style={{
                  height: `${h}%`,
                  backgroundColor: negative ? "#ef4444" : color,
                  opacity: 0.85,
                  minHeight: 2,
                }}
              />
              <div className="mt-1 hidden text-[9px] text-muted-foreground group-hover:block">
                {d.date.slice(2, 7)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

function AnalystAndPriceRefs({ profile }: { profile: Profile }) {
  const targetMean = profile.target_mean;
  const last = profile.fifty_day_avg;
  const targetUpside = targetMean && last ? (targetMean - last) / last : null;

  const priceRefs = [
    { label: "52w High", value: numFmt(profile.fifty_two_week_high) },
    { label: "52w Low", value: numFmt(profile.fifty_two_week_low) },
    { label: "50d avg", value: numFmt(profile.fifty_day_avg) },
    { label: "200d avg", value: numFmt(profile.two_hundred_day_avg) },
    { label: "Beta", value: numFmt(profile.beta) },
    { label: "Short %", value: pctFmt(profile.short_percent_of_float) },
  ];

  const targets = [
    { label: "Target mean", value: numFmt(profile.target_mean) },
    { label: "Target low", value: numFmt(profile.target_low) },
    { label: "Target high", value: numFmt(profile.target_high) },
    { label: "Recommendation", value: profile.recommendation ?? "—" },
    { label: "Analysts", value: profile.analyst_count?.toString() ?? "—" },
    {
      label: "Upside vs 50d",
      value: targetUpside != null ? `${targetUpside >= 0 ? "+" : ""}${(targetUpside * 100).toFixed(1)}%` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <RatioCard title="Price references" rows={priceRefs} />
      <RatioCard title="Analyst targets" rows={targets} />
    </div>
  );
}

// ---------- formatters ----------

function numFmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function pctFmt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function bigFmt(n: number | null | undefined, currency: string): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  let val: string;
  if (abs >= 1e12) val = `${(abs / 1e12).toFixed(2)}T`;
  else if (abs >= 1e9) val = `${(abs / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) val = `${(abs / 1e6).toFixed(2)}M`;
  else if (abs >= 1e3) val = `${(abs / 1e3).toFixed(2)}K`;
  else val = abs.toFixed(2);
  const sym = currency === "USD" ? "$" : currency === "TRY" ? "₺" : "";
  return `${sign}${sym}${val}`;
}
