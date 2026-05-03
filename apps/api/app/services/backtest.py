"""Backtest verification — check actual returns after a historical agent decision."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)


def verify(ticker: str, trade_date: str, signal: str, holding_days: int = 5) -> dict:
    """Compute the actual N-day forward return after the agent's decision.

    Returns:
      {
        verified: bool,
        signal: str,                      # original signal (e.g. "Overweight")
        direction: "buy"|"sell"|"hold",   # mapped from signal
        entry_close: float | None,
        exit_close: float | None,
        actual_return: float | None,      # raw return %
        spy_return: float | None,
        alpha: float | None,
        verdict: "right" | "wrong" | "neutral" | "pending",
        holding_days: int,
        reason: str,                      # explanation
      }
    """
    sig = (signal or "").upper()
    if any(b in sig for b in ("STRONG BUY", "OVERWEIGHT", "BUY")):
        direction = "buy"
    elif any(b in sig for b in ("STRONG SELL", "UNDERWEIGHT", "SELL")):
        direction = "sell"
    else:
        direction = "hold"

    try:
        start = datetime.strptime(trade_date, "%Y-%m-%d")
    except Exception:
        return {"verified": False, "reason": "invalid trade_date format"}

    # Need enough trading days; pad by 1.5x for weekends/holidays
    end = start + timedelta(days=int(holding_days * 2) + 7)
    end_str = end.strftime("%Y-%m-%d")
    today = datetime.utcnow()

    if start > today:
        return {
            "verified": False,
            "signal": signal,
            "direction": direction,
            "verdict": "pending",
            "reason": "trade date is in the future",
        }

    if end > today:
        # Not enough forward data yet
        return {
            "verified": False,
            "signal": signal,
            "direction": direction,
            "verdict": "pending",
            "reason": f"need {holding_days} trading days after {trade_date}, not yet elapsed",
            "holding_days": holding_days,
        }

    try:
        stock = yf.Ticker(ticker).history(start=trade_date, end=end_str)
        spy = yf.Ticker("SPY").history(start=trade_date, end=end_str)
    except Exception as e:
        return {"verified": False, "reason": f"yfinance error: {e}"}

    if len(stock) < 2 or len(spy) < 2:
        return {
            "verified": False,
            "signal": signal,
            "direction": direction,
            "verdict": "pending",
            "reason": "insufficient price data (ticker may be too recent or delisted)",
        }

    actual_idx = min(holding_days, len(stock) - 1, len(spy) - 1)
    entry = float(stock["Close"].iloc[0])
    exit_ = float(stock["Close"].iloc[actual_idx])
    raw = (exit_ - entry) / entry
    spy_entry = float(spy["Close"].iloc[0])
    spy_exit = float(spy["Close"].iloc[actual_idx])
    spy_ret = (spy_exit - spy_entry) / spy_entry
    alpha = raw - spy_ret

    # Verdict: did agent get the direction right?
    if direction == "buy":
        verdict = "right" if raw > 0 else "wrong"
    elif direction == "sell":
        verdict = "right" if raw < 0 else "wrong"
    else:
        # HOLD — neutral verdict if move was small (<1%), otherwise wrong
        verdict = "neutral" if abs(raw) < 0.01 else "wrong"

    return {
        "verified": True,
        "signal": signal,
        "direction": direction,
        "entry_close": entry,
        "exit_close": exit_,
        "actual_return": raw,
        "spy_return": spy_ret,
        "alpha": alpha,
        "verdict": verdict,
        "holding_days": actual_idx,
        "reason": "ok",
    }
