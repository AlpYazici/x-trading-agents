"""Portfolio time-series snapshots."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlmodel import Session, select

from ..db import Holding, PortfolioSnapshot, engine
from . import holdings as holdings_svc


SNAPSHOT_INTERVAL_MIN = 30  # don't snapshot more than once per 30 min


def maybe_snapshot() -> bool:
    """Take a snapshot if the last one is older than SNAPSHOT_INTERVAL_MIN.

    Returns True if a new snapshot was written.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=SNAPSHOT_INTERVAL_MIN)
    with Session(engine) as s:
        latest = s.exec(
            select(PortfolioSnapshot).order_by(PortfolioSnapshot.id.desc()).limit(1)  # type: ignore[arg-type]
        ).first()
        if latest and latest.ts > cutoff:
            return False

        rows = s.exec(select(Holding).order_by(Holding.id)).all()  # type: ignore[arg-type]
        breakdown = []
        total_usd = 0.0
        total_pl_usd = 0.0
        for h in rows:
            price = holdings_svc.get_price(h.symbol, h.exchange)
            if price is None:
                continue
            mv = price * h.qty
            pl = (price - h.entry_price) * h.qty
            fx = holdings_svc.fx_rate(h.currency, "USD") or 1.0
            mv_usd = mv * fx
            pl_usd = pl * fx
            total_usd += mv_usd
            total_pl_usd += pl_usd
            breakdown.append({
                "symbol": h.symbol,
                "exchange": h.exchange,
                "value_usd": mv_usd,
                "pl_usd": pl_usd,
            })

        if not breakdown:
            return False

        snap = PortfolioSnapshot(
            total_usd=total_usd,
            total_pl_usd=total_pl_usd,
            holdings_count=len(breakdown),
            breakdown=json.dumps(breakdown),
        )
        s.add(snap)
        s.commit()
        return True


def get_history(days: int = 30) -> list[dict]:
    """Return all snapshots within the last N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    with Session(engine) as s:
        rows = s.exec(
            select(PortfolioSnapshot)
            .where(PortfolioSnapshot.ts >= cutoff)
            .order_by(PortfolioSnapshot.ts)  # type: ignore[arg-type]
        ).all()
        return [
            {
                "ts": r.ts.isoformat(),
                "total_usd": r.total_usd,
                "total_pl_usd": r.total_pl_usd,
                "holdings_count": r.holdings_count,
            }
            for r in rows
        ]


def get_backfilled_history(days: int = 90, period: str | None = None, interval: str = "1d") -> list[dict]:
    """Compute historical portfolio value from yfinance OHLC.

    Assumes current holdings existed for the entire window. Cost basis is
    computed at current FX. Returns time series at requested interval.

    Args:
        days: convenience — used only when `period` is None
        period: yfinance period string (e.g. "1d", "5d", "1mo", "3mo", "1y")
        interval: yfinance interval ("5m", "15m", "1h", "1d", "1wk")
    """
    import yfinance as yf
    import pandas as pd

    if period is None:
        period = _period_for_days(days)
    with Session(engine) as s:
        holdings = s.exec(select(Holding).order_by(Holding.id)).all()  # type: ignore[arg-type]

    if not holdings:
        return []

    # Per-day (date) USD value sum — normalize timezones to date
    per_date_value: dict[str, float] = {}
    per_date_count: dict[str, int] = {}  # how many holdings priced this date
    fx_today: dict[str, float] = {}
    cost_usd_total = 0.0

    fx_series_cache: dict[str, "pd.Series"] = {}

    def _get_fx_series(ccy: str, period: str = "5d", interval: str = "1d") -> "pd.Series | None":
        if ccy == "USD":
            return None
        cache_key = f"{ccy}-{period}-{interval}"
        if cache_key in fx_series_cache:
            return fx_series_cache[cache_key]
        # Try requested granularity first
        for try_interval in (interval, "1d"):
            try:
                fx_hist = yf.Ticker(f"{ccy}USD=X").history(period=period, interval=try_interval)
                if len(fx_hist) > 0:
                    fx_series_cache[cache_key] = fx_hist["Close"]
                    return fx_hist["Close"]
            except Exception:
                continue
            # FX has no intraday on weekends — fall back to daily 5d
            if try_interval != "1d":
                try:
                    fx_hist = yf.Ticker(f"{ccy}USD=X").history(period="5d", interval="1d")
                    if len(fx_hist) > 0:
                        fx_series_cache[cache_key] = fx_hist["Close"]
                        return fx_hist["Close"]
                except Exception:
                    continue
        return None

    for h in holdings:
        yf_sym = holdings_svc.yf_symbol(h.symbol, h.exchange)
        try:
            hist = yf.Ticker(yf_sym).history(period=period, interval=interval)
        except Exception:
            continue
        if len(hist) == 0:
            continue

        # FX series at same granularity (FX trades 24/5, so daily fallback for short intervals if intraday FX unavailable)
        fx_series = _get_fx_series(h.currency, period=period, interval=interval)
        # current FX for cost basis
        cur_fx = holdings_svc.fx_rate(h.currency, "USD") or 1.0
        fx_today[h.currency] = cur_fx
        cost_usd_total += h.qty * h.entry_price * cur_fx

        # Iterate bars — normalize timestamp. For intraday intervals keep
        # full ISO datetime so multiple bars per day are distinct.
        is_intraday = interval not in ("1d", "1wk", "1mo")
        for ts, row in hist.iterrows():
            close = float(row["Close"])
            if is_intraday:
                date_key = pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M")  # type: ignore[union-attr]
            else:
                date_key = ts.date().isoformat()  # type: ignore[union-attr]

            # FX for this date
            if fx_series is not None:
                ts_naive = pd.Timestamp(ts).tz_localize(None) if pd.Timestamp(ts).tz is not None else pd.Timestamp(ts)
                fx_dates = fx_series.index.tz_localize(None) if fx_series.index.tz is not None else fx_series.index
                # nearest before
                pos = fx_dates.searchsorted(ts_naive)
                if pos >= len(fx_series):
                    fx = float(fx_series.iloc[-1])
                elif pos == 0:
                    fx = float(fx_series.iloc[0])
                else:
                    fx = float(fx_series.iloc[pos - 1])
            else:
                fx = 1.0

            value_usd = h.qty * close * fx
            per_date_value[date_key] = per_date_value.get(date_key, 0.0) + value_usd
            per_date_count[date_key] = per_date_count.get(date_key, 0) + 1

    if not per_date_value:
        return []

    # Only emit dates where ALL holdings have a price (avoid undercounted spikes)
    expected = len(holdings)
    series = []
    for date_key in sorted(per_date_value.keys()):
        if per_date_count[date_key] < expected:
            continue  # skip days when one of the markets was closed
        total = per_date_value[date_key]
        pl = total - cost_usd_total
        series.append({
            "ts": date_key,
            "total_usd": total,
            "total_pl_usd": pl,
            "holdings_count": expected,
        })
    return series


def _period_for_days(days: int) -> str:
    """Map days to a yfinance period string."""
    if days <= 5:
        return "5d"
    if days <= 31:
        return "1mo"
    if days <= 92:
        return "3mo"
    if days <= 186:
        return "6mo"
    if days <= 366:
        return "1y"
    if days <= 732:
        return "2y"
    return "5y"
