"""Trade outcome attribution: aggregate per-ticker / per-sector / per-signal
win rates from completed runs, using the existing backtest verifier.

The existing /backtest/run/{id} endpoint verifies a single run's signal
against actual N-day forward return. This service runs that verifier on
*every* completed run and rolls up the results so the user can see which
tickers / sectors / signal types the agent actually predicts well.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import time
from typing import Optional

import yfinance as yf
from sqlmodel import Session, select

from ..db import Run, engine
from . import backtest as bt

logger = logging.getLogger(__name__)

_AGG_TTL = 30 * 60  # 30 min — backtest verifier hits yfinance, expensive
_agg_cache: dict[tuple[int, int], tuple[dict, float]] = {}

_sector_cache: dict[str, tuple[str | None, float]] = {}
_SECTOR_TTL = 24 * 3600


def _get_sector(symbol: str) -> Optional[str]:
    """Cached sector lookup via yfinance .info — best-effort."""
    sym = symbol.upper().strip()
    now = time()
    cached = _sector_cache.get(sym)
    if cached and now - cached[1] < _SECTOR_TTL:
        return cached[0]
    try:
        info = yf.Ticker(sym).info
        sector = info.get("sector") if info else None
    except Exception:
        sector = None
    _sector_cache[sym] = (sector, now)
    return sector


def _normalize_signal(s: str | None) -> str:
    """Bucket free-form signal text into BUY / SELL / HOLD."""
    if not s:
        return "UNKNOWN"
    u = s.upper()
    if "BUY" in u or "OVERWEIGHT" in u:
        return "BUY"
    if "SELL" in u or "UNDERWEIGHT" in u:
        return "SELL"
    if "HOLD" in u:
        return "HOLD"
    return "OTHER"


def _verify_one(run: Run, holding_days: int) -> Optional[dict]:
    """Run the verifier on a single run, return enriched outcome dict."""
    try:
        result = bt.verify(run.ticker, run.trade_date, run.signal or "", holding_days=holding_days)
    except Exception as e:
        logger.debug("verify failed for run %s: %s", run.id, e)
        return None
    if result.get("verdict") == "pending":
        return None
    return {
        "run_id": run.id,
        "ticker": run.ticker,
        "trade_date": run.trade_date,
        "signal": _normalize_signal(run.signal),
        "raw_signal": run.signal,
        "verdict": result.get("verdict"),
        "actual_return": result.get("actual_return"),
        "spy_return": result.get("spy_return"),
        "alpha": result.get("alpha"),
        "sector": _get_sector(run.ticker),
    }


def _aggregate(outcomes: list[dict]) -> dict:
    """Roll up outcomes into per-ticker, per-sector, per-signal buckets."""
    by_ticker: dict[str, dict] = defaultdict(lambda: {"runs": 0, "wins": 0, "losses": 0, "neutral": 0, "alpha_sum": 0.0, "ret_sum": 0.0})
    by_sector: dict[str, dict] = defaultdict(lambda: {"runs": 0, "wins": 0, "losses": 0, "neutral": 0, "alpha_sum": 0.0})
    by_signal: dict[str, dict] = defaultdict(lambda: {"runs": 0, "wins": 0, "losses": 0, "neutral": 0, "alpha_sum": 0.0})

    for o in outcomes:
        for bucket, key in [
            (by_ticker, o["ticker"]),
            (by_sector, o.get("sector") or "Unknown"),
            (by_signal, o["signal"]),
        ]:
            row = bucket[key]
            row["runs"] += 1
            v = o.get("verdict")
            if v == "right":
                row["wins"] += 1
            elif v == "wrong":
                row["losses"] += 1
            elif v == "neutral":
                row["neutral"] += 1
            if isinstance(o.get("alpha"), (int, float)):
                row["alpha_sum"] += float(o["alpha"])
            if "ret_sum" in row and isinstance(o.get("actual_return"), (int, float)):
                row["ret_sum"] += float(o["actual_return"])

    def _finalize(d: dict, with_ret: bool = False) -> list[dict]:
        out = []
        for k, v in d.items():
            decided = v["wins"] + v["losses"]
            row = {
                "key": k,
                "runs": v["runs"],
                "wins": v["wins"],
                "losses": v["losses"],
                "neutral": v["neutral"],
                "win_rate": (v["wins"] / decided) if decided else None,
                "avg_alpha": (v["alpha_sum"] / v["runs"]) if v["runs"] else None,
            }
            if with_ret:
                row["avg_return"] = (v["ret_sum"] / v["runs"]) if v["runs"] else None
            out.append(row)
        out.sort(key=lambda r: -r["runs"])
        return out

    return {
        "total_runs_verified": len(outcomes),
        "by_ticker": _finalize(by_ticker, with_ret=True),
        "by_sector": _finalize(by_sector),
        "by_signal": _finalize(by_signal),
        "outcomes": sorted(outcomes, key=lambda o: o["trade_date"], reverse=True),
    }


def get_attribution(holding_days: int = 5, min_age_days: int = 5) -> dict:
    """Aggregate outcome attribution across all completed runs older than
    `min_age_days`. Caches the full computation for 30 min.
    """
    cache_key = (holding_days, min_age_days)
    now = time()
    cached = _agg_cache.get(cache_key)
    if cached and now - cached[1] < _AGG_TTL:
        return cached[0]

    from datetime import date, timedelta
    cutoff = (date.today() - timedelta(days=min_age_days)).isoformat()

    with Session(engine) as s:
        runs = s.exec(
            select(Run).where(Run.status == "completed").where(Run.trade_date <= cutoff)  # type: ignore[arg-type]
        ).all()

    if not runs:
        result = {
            "total_runs_verified": 0,
            "by_ticker": [],
            "by_sector": [],
            "by_signal": [],
            "outcomes": [],
        }
        _agg_cache[cache_key] = (result, now)
        return result

    outcomes: list[dict] = []
    # Verifier hits yfinance per run; parallelize but stay polite.
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = [ex.submit(_verify_one, r, holding_days) for r in runs]
        for f in as_completed(futures):
            o = f.result()
            if o is not None:
                outcomes.append(o)

    result = _aggregate(outcomes)
    _agg_cache[cache_key] = (result, now)
    return result
