"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  init,
  dispose,
  registerOverlay,
  CandleType,
  type Chart,
  type KLineData,
  type OverlayTemplate,
  type OverlayFigure,
} from "klinecharts";
import {
  Minus,
  TrendingUp,
  Square,
  Ruler,
  Type as TypeIcon,
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

// klinecharts ships fibonacci/segment/horizontal/etc out of the box but does
// NOT include rectangle or measure. Both are registered below as custom
// overlays so the toolbar can offer them.
const DRAW_TOOLS: { name: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { name: "horizontalRayLine", label: "Horizontal", Icon: Minus },
  { name: "segment",           label: "Trend line", Icon: TrendingUp },
  { name: "rectangle",         label: "Rectangle",  Icon: Square },
  { name: "fibonacciLine",     label: "Fibonacci",  Icon: ArrowUpDown },
  { name: "priceChannelLine",  label: "Channel",    Icon: Activity },
  { name: "measure",           label: "Measure",    Icon: Ruler },
  { name: "simpleAnnotation",  label: "Note",       Icon: TypeIcon },
];

// One-time global registration. Module-level guard so HMR / multiple chart
// instances don't try to register twice (which would throw).
let _customOverlaysRegistered = false;
function ensureCustomOverlays() {
  if (_customOverlaysRegistered) return;
  _customOverlaysRegistered = true;

  const rectangle: OverlayTemplate = {
    name: "rectangle",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const points = overlay.points ?? [];

      const figures: OverlayFigure[] = [
        {
          type: "polygon",
          attrs: {
            coordinates: [
              { x: a.x, y: a.y },
              { x: b.x, y: a.y },
              { x: b.x, y: b.y },
              { x: a.x, y: b.y },
            ],
          },
          styles: {
            style: "stroke_fill",
            color: "rgba(139,92,246,0.18)",
            borderColor: "#8b5cf6",
            borderSize: 2,
          },
        },
      ];

      // Corner labels with price delta + percent change (top-vs-bottom of the
      // rectangle, regardless of which corner the user clicked first).
      if (points.length >= 2) {
        const v0 = points[0].value ?? 0;
        const v1 = points[1].value ?? 0;
        const high = Math.max(v0, v1);
        const low = Math.min(v0, v1);
        const delta = high - low;
        const pct = low ? (delta / low) * 100 : 0;
        const bars = Math.abs(
          (points[1].dataIndex ?? 0) - (points[0].dataIndex ?? 0)
        );

        // Pixel coords for the rectangle's top-right and bottom-right corners.
        const rightX = Math.max(a.x, b.x);
        const topY = Math.min(a.y, b.y);
        const bottomY = Math.max(a.y, b.y);

        const upLabel = `+${delta.toFixed(2)}  (+${pct.toFixed(2)}%)`;
        const downLabel = `-${delta.toFixed(2)}  (-${pct.toFixed(2)}%)`;

        const labelStyleBase = {
          color: "#fff",
          size: 10,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 4,
          family: "ui-sans-serif, system-ui",
          weight: "600",
        };

        figures.push(
          {
            type: "text",
            attrs: {
              x: rightX - 4,
              y: topY + 4,
              text: upLabel,
              align: "right",
              baseline: "top",
            },
            styles: { ...labelStyleBase, backgroundColor: "#10b981" },
          },
          {
            type: "text",
            attrs: {
              x: rightX - 4,
              y: bottomY - 4,
              text: downLabel,
              align: "right",
              baseline: "bottom",
            },
            styles: { ...labelStyleBase, backgroundColor: "#ef4444" },
          },
          {
            type: "text",
            attrs: {
              x: rightX - 4,
              y: (topY + bottomY) / 2,
              text: `${bars} bars`,
              align: "right",
              baseline: "middle",
            },
            styles: { ...labelStyleBase, backgroundColor: "rgba(0,0,0,0.6)" },
          }
        );
      }

      return figures;
    },
  };

  // Measure: rectangle + a label showing price delta, % change, and bar count
  // between the two anchor points (TradingView's price-range tool behavior).
  const measure: OverlayTemplate = {
    name: "measure",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const points = overlay.points ?? [];
      if (points.length < 2) return [];

      const p0 = points[0];
      const p1 = points[1];
      const v0 = p0.value ?? 0;
      const v1 = p1.value ?? 0;
      const delta = v1 - v0;
      const pct = v0 ? (delta / v0) * 100 : 0;
      const bars = Math.abs((p1.dataIndex ?? 0) - (p0.dataIndex ?? 0));

      const up = delta >= 0;
      const fill = up ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)";
      const border = up ? "#10b981" : "#ef4444";

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      const sign = up ? "+" : "";
      const label =
        `${sign}${delta.toFixed(2)}  (${sign}${pct.toFixed(2)}%)\n` +
        `${bars} bars`;

      // Clamp label inside chart bounds so it never paints offscreen.
      const labelX = Math.max(20, Math.min(midX, (bounding?.width ?? midX + 100) - 20));
      const labelY = Math.max(20, Math.min(midY, (bounding?.height ?? midY + 100) - 20));

      return [
        {
          type: "polygon",
          attrs: {
            coordinates: [
              { x: a.x, y: a.y },
              { x: b.x, y: a.y },
              { x: b.x, y: b.y },
              { x: a.x, y: b.y },
            ],
          },
          styles: { style: "stroke_fill", color: fill, borderColor: border, borderSize: 1 },
        },
        {
          type: "text",
          attrs: {
            x: labelX,
            y: labelY,
            text: label,
            align: "center",
            baseline: "middle",
          },
          styles: {
            color: "#fff",
            backgroundColor: border,
            size: 11,
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 6,
            family: "ui-sans-serif, system-ui",
            weight: "600",
          },
        },
      ];
    },
  };

  registerOverlay(rectangle);
  registerOverlay(measure);
}

ensureCustomOverlays();

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
