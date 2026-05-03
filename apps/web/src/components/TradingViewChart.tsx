"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

type Props = {
  symbol: string;
  interval?: string; // "1", "5", "15", "60", "D"
  height?: number | string;
  studies?: string[];
};

let scriptLoading: Promise<void> | null = null;
function loadTradingView(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("TradingView script failed"));
    document.head.appendChild(s);
  });
  return scriptLoading;
}

export function TradingViewChart({
  symbol,
  interval = "D",
  height = 480,
  studies = ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const containerId = `tv-${symbol}-${Math.random().toString(36).slice(2, 8)}`;

  useEffect(() => {
    let cancelled = false;
    loadTradingView()
      .then(() => {
        if (cancelled || !containerRef.current || !window.TradingView) return;
        containerRef.current.id = containerId;
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone: "Etc/UTC",
          theme: resolvedTheme === "dark" ? "dark" : "light",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: containerId,
          hide_side_toolbar: false,
          studies,
          backgroundColor: resolvedTheme === "dark" ? "rgba(0,0,0,0)" : "rgba(255,255,255,0)",
          show_popup_button: true,
          popup_width: "1000",
          popup_height: "650",
        });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, interval, resolvedTheme, containerId, studies]);

  return (
    <div
      ref={containerRef}
      style={{ height: typeof height === "number" ? `${height}px` : height, width: "100%" }}
    />
  );
}
