"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type CandlestickData,
  type HistogramData,
  type LineData,
} from "lightweight-charts";
import { apiGet } from "@/lib/api";

type Bar = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type Range = { period: string; interval: string };

const RANGES: { label: string; r: Range }[] = [
  { label: "1D",  r: { period: "1d",  interval: "5m" } },
  { label: "5D",  r: { period: "5d",  interval: "15m" } },
  { label: "1M",  r: { period: "1mo", interval: "1h" } },
  { label: "3M",  r: { period: "3mo", interval: "1d" } },
  { label: "6M",  r: { period: "6mo", interval: "1d" } },
  { label: "1Y",  r: { period: "1y",  interval: "1d" } },
  { label: "5Y",  r: { period: "5y",  interval: "1wk" } },
];

type ChartType = "candle" | "area";

export function LightweightChart({
  symbol,
  exchange = "US",
  height = 460,
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
  const range = RANGES[rangeIdx].r;

  const { data, isLoading, error } = useQuery({
    queryKey: ["ohlc", symbol, exchange, range.period, range.interval],
    queryFn: () =>
      apiGet<Bar[]>(
        `/ohlc?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&period=${range.period}&interval=${range.interval}`
      ),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // create / recreate chart
  useEffect(() => {
    if (!containerRef.current) return;

    const dark = resolvedTheme === "dark";
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#a1a1aa" : "#52525b",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'",
      },
      grid: {
        vertLines: { color: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" },
        horzLines: { color: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 4, barSpacing: 6 },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    if (chartType === "candle") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
        borderVisible: false,
      });
      priceSeriesRef.current = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        topColor: "rgba(139,92,246,0.4)",
        bottomColor: "rgba(139,92,246,0.0)",
        lineColor: "#8b5cf6",
        lineWidth: 2,
        priceLineVisible: false,
      });
      priceSeriesRef.current = series;
    }

    const vol = chart.addSeries(HistogramSeries, {
      color: dark ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.35)",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volSeriesRef.current = vol;

    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, [resolvedTheme, chartType]);

  // feed data
  useEffect(() => {
    if (!data || !priceSeriesRef.current || !volSeriesRef.current) return;

    if (chartType === "candle") {
      const bars: CandlestickData<Time>[] = data.map((b) => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
      (priceSeriesRef.current as ISeriesApi<"Candlestick">).setData(bars);
    } else {
      const bars: LineData<Time>[] = data.map((b) => ({
        time: b.time as Time,
        value: b.close,
      }));
      (priceSeriesRef.current as ISeriesApi<"Area">).setData(bars);
    }

    const vols: HistogramData<Time>[] = data
      .filter((b) => b.volume != null)
      .map((b) => ({
        time: b.time as Time,
        value: b.volume!,
        color:
          b.close >= b.open
            ? "rgba(16,185,129,0.4)"
            : "rgba(239,68,68,0.4)",
      }));
    volSeriesRef.current.setData(vols);

    chartRef.current?.timeScale().fitContent();
  }, [data, chartType]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {RANGES.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setRangeIdx(i)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition sm:px-3 ${
                rangeIdx === i
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {(["candle", "area"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                chartType === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
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
