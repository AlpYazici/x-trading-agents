"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { init, dispose, CandleType, type Chart, type KLineData } from "klinecharts";
import {
  Minus,
  TrendingUp,
  Square,
  Ruler,
  Type as TypeIcon,
  Trash2,
  Eraser,
  ArrowUpDown,
  Activity,
} from "lucide-react";
import { apiGet } from "@/lib/api";

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type Range = { period: string; interval: string };
const RANGES: { label: string; r: Range }[] = [
  { label: "1D", r: { period: "1d", interval: "5m" } },
  { label: "5D", r: { period: "5d", interval: "15m" } },
  { label: "1M", r: { period: "1mo", interval: "1h" } },
  { label: "3M", r: { period: "3mo", interval: "1d" } },
  { label: "6M", r: { period: "6mo", interval: "1d" } },
  { label: "1Y", r: { period: "1y", interval: "1d" } },
  { label: "5Y", r: { period: "5y", interval: "1wk" } },
];

type ChartType = "candle" | "area";

function detectExchange(sym: string, fallback: string): string {
  const s = sym.toUpperCase();
  if (s.endsWith(".IS")) return "BIST";
  if (s.endsWith(".L") || s.endsWith(".DE") || s.endsWith(".PA") || s.endsWith(".AS"))
    return "US";
  if (s.startsWith("^") || s.includes("=")) return "US";
  if (s.endsWith("-USD") || s.endsWith("USDT")) return "CRYPTO";
  const cryptoBases = new Set([
    "BTC","ETH","SOL","XRP","DOGE","ADA","AVAX","MATIC","LINK","DOT","LTC","BCH",
  ]);
  if (cryptoBases.has(s)) return "CRYPTO";
  return fallback;
}

// Tools available in klinecharts overlay set. Names match library conventions.
const DRAW_TOOLS: { name: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { name: "horizontalRayLine", label: "Horizontal", Icon: Minus },
  { name: "segment",           label: "Trend line", Icon: TrendingUp },
  { name: "rect",              label: "Rectangle", Icon: Square },
  { name: "fibonacciLine",     label: "Fibonacci", Icon: ArrowUpDown },
  { name: "priceChannelLine",  label: "Channel",   Icon: Activity },
  { name: "priceLine",         label: "Measure",   Icon: Ruler },
  { name: "simpleAnnotation",  label: "Note",      Icon: TypeIcon },
];

const INDICATORS: { name: string; label: string; pane: "main" | "sub" }[] = [
  { name: "MA",   label: "MA",   pane: "main" },
  { name: "EMA",  label: "EMA",  pane: "main" },
  { name: "BOLL", label: "BOLL", pane: "main" },
  { name: "VOL",  label: "VOL",  pane: "sub" },
  { name: "MACD", label: "MACD", pane: "sub" },
  { name: "RSI",  label: "RSI",  pane: "sub" },
  { name: "KDJ",  label: "KDJ",  pane: "sub" },
];

export function TradingChart({
  symbol,
  exchange,
  height = 520,
  defaultRange = 3,
  defaultType = "candle",
}: {
  symbol: string;
  exchange?: string;
  height?: number;
  defaultRange?: number;
  defaultType?: ChartType;
}) {
  const { resolvedTheme } = useTheme();
  const [rangeIdx, setRangeIdx] = useState(defaultRange);
  const [chartType, setChartType] = useState<ChartType>(defaultType);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(["VOL"])
  );
  const subPaneIds = useRef<Map<string, string>>(new Map());
  const range = RANGES[rangeIdx].r;
  const effectiveExchange = exchange || detectExchange(symbol, "US");

  const { data, isLoading, error } = useQuery({
    queryKey: ["ohlc", symbol, effectiveExchange, range.period, range.interval],
    queryFn: () =>
      apiGet<Bar[]>(
        `/ohlc?symbol=${encodeURIComponent(symbol)}&exchange=${effectiveExchange}&period=${range.period}&interval=${range.interval}`
      ),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const containerId = useRef(
    `kchart-${Math.random().toString(36).slice(2, 9)}`
  );

  // Init chart once. Theme/type rebuild via separate effect.
  useEffect(() => {
    if (!containerRef.current) return;
    const dark = resolvedTheme === "dark";

    const c = init(containerRef.current, {
      styles: themeStyles(dark, chartType),
      locale: "en-US",
    });
    if (!c) return;
    chartRef.current = c;

    // Always-on volume sub-pane.
    const volId = c.createIndicator("VOL", false, { height: 80 });
    if (volId) subPaneIds.current.set("VOL", volId);

    return () => {
      subPaneIds.current.clear();
      dispose(containerRef.current!);
      chartRef.current = null;
    };
  }, [resolvedTheme, chartType]);

  // Push data when it arrives.
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const klines: KLineData[] = data.map((b) => ({
      timestamp: b.time * 1000,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume ?? 0,
    }));
    chartRef.current.applyNewData(klines);
  }, [data]);

  function toggleIndicator(name: string, pane: "main" | "sub") {
    const c = chartRef.current;
    if (!c) return;
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        const id = subPaneIds.current.get(name);
        if (pane === "sub" && id) {
          c.removeIndicator(id, name);
        } else {
          c.removeIndicator("candle_pane", name);
        }
        subPaneIds.current.delete(name);
        next.delete(name);
      } else {
        if (pane === "sub") {
          const id = c.createIndicator(name, false, { height: 80 });
          if (id) subPaneIds.current.set(name, id);
        } else {
          c.createIndicator(name, true, { id: "candle_pane" });
        }
        next.add(name);
      }
      return next;
    });
  }

  function startDraw(name: string) {
    chartRef.current?.createOverlay({ name });
  }

  function clearDrawings() {
    chartRef.current?.removeOverlay();
  }

  return (
    <div className="space-y-2">
      {/* Range + chart-type toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {RANGES.map((opt, i) => (
            <Pill
              key={opt.label}
              active={rangeIdx === i}
              onClick={() => setRangeIdx(i)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {(["candle", "area"] as const).map((t) => (
            <Pill
              key={t}
              active={chartType === t}
              onClick={() => setChartType(t)}
              className="capitalize"
            >
              {t}
            </Pill>
          ))}
        </div>
      </div>

      {/* Drawing toolbar + indicator menu */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {DRAW_TOOLS.map((t) => (
            <button
              key={t.name}
              onClick={() => startDraw(t.name)}
              title={t.label}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              <t.Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
          <button
            onClick={clearDrawings}
            title="Clear drawings"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-500/10"
          >
            <Eraser className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {INDICATORS.map((ind) => (
            <Pill
              key={ind.name}
              active={activeIndicators.has(ind.name)}
              onClick={() => toggleIndicator(ind.name, ind.pane)}
            >
              {ind.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative" style={{ height }}>
        <div
          id={containerId.current}
          ref={containerRef}
          className="absolute inset-0"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 text-sm text-muted-foreground backdrop-blur-sm">
            Loading {symbol}...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">
            Failed to load OHLC: {String(error)}
          </div>
        )}
        {data && data.length > 0 && (
          <div className="pointer-events-none absolute right-3 top-2 rounded-md bg-background/70 px-2 py-1 text-xs font-mono shadow-sm backdrop-blur">
            {data[data.length - 1].close.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium transition sm:px-3 ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function themeStyles(dark: boolean, chartType: ChartType) {
  const grid = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const text = dark ? "#a1a1aa" : "#52525b";
  const axisLine = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  const up = "#10b981";
  const down = "#ef4444";

  return {
    grid: {
      horizontal: { color: grid },
      vertical: { color: grid },
    },
    candle: {
      type: chartType === "area" ? CandleType.Area : CandleType.CandleSolid,
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: text,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: text,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: text,
      },
      area: {
        lineColor: "#8b5cf6",
        lineSize: 2,
        backgroundColor: [
          { offset: 0, color: "rgba(139,92,246,0.4)" },
          { offset: 1, color: "rgba(139,92,246,0.0)" },
        ],
      },
      tooltip: {
        text: { color: text },
      },
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickText: { color: text },
      tickLine: { color: axisLine },
    },
    yAxis: {
      axisLine: { color: axisLine },
      tickText: { color: text },
      tickLine: { color: axisLine },
    },
    crosshair: {
      horizontal: {
        line: { color: text, dashedValue: [4, 2] },
        text: { color: "#fff", backgroundColor: text },
      },
      vertical: {
        line: { color: text, dashedValue: [4, 2] },
        text: { color: "#fff", backgroundColor: text },
      },
    },
    indicator: {
      tooltip: { text: { color: text } },
    },
    overlay: {
      text: { color: text },
    },
    separator: {
      color: axisLine,
    },
  };
}
