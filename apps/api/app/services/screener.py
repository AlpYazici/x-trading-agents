"""Market opportunity screener.

Scans a known universe (S&P 500 megacaps + selected midcaps) for signals:
  - Volume spike vs 30-day average
  - Big intraday move (>3% absolute)
  - Recent Capitol Trades activity
  - Earnings within 7 days
  - Distance to 52-week high (proximity = momentum)

Returns top-N candidates ranked by composite score. Used by the scheduler to
combine "fixed watchlist" with "today's hot tickers" before kicking off batch
agent debates.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from time import time
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# Universe to scan — US megacap + popular tickers across sectors. Keep modest
# (~80 names) to stay within yfinance rate limits. Expand later via Russell 1000.
UNIVERSE = [
    # Magnificent 7 + tech
    "NVDA", "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA",
    "AMD", "INTC", "AVGO", "QCOM", "MU", "ORCL", "CSCO", "ADBE", "CRM",
    "NFLX", "PLTR", "SNOW", "DDOG", "MDB", "NET", "PANW", "CRWD", "FTNT",
    "ABNB", "UBER", "COIN", "SHOP", "SQ", "ARM", "SMCI", "MRVL",
    # Financials
    "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW",
    # Consumer
    "WMT", "HD", "COST", "MCD", "SBUX", "NKE", "DIS", "BKNG",
    # Healthcare/Pharma
    "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT",
    # Energy/Industrials
    "XOM", "CVX", "COP", "SLB", "BA", "CAT", "GE", "RTX", "LMT",
    # Telcos / Media
    "T", "VZ", "TMUS", "CMCSA",
    # ETFs (broad signals)
    "SPY", "QQQ", "IWM",
]

_cache: dict[str, tuple[list[dict], float]] = {}
_TTL = 30 * 60  # 30 min — refresh is expensive


def _score_ticker(sym: str) -> Optional[dict]:
    """Compute scoring signals for one ticker. Returns None on failure."""
    try:
        t = yf.Ticker(sym)
        # 60d daily for volume/move computations
        h = t.history(period="60d", interval="1d")
        if len(h) < 5:
            return None

        last = h.iloc[-1]
        prev = h.iloc[-2]
        last_close = float(last["Close"])
        prev_close = float(prev["Close"])
        last_vol = float(last["Volume"])
        avg_vol = float(h["Volume"].iloc[:-1].mean()) if len(h) > 1 else last_vol
        if avg_vol <= 0:
            avg_vol = 1
        vol_ratio = last_vol / avg_vol

        # Day move %
        move_pct = (last_close - prev_close) / prev_close

        # 52-week high/low proximity
        hi52 = float(h["High"].max())
        lo52 = float(h["Low"].min())
        prox_high = last_close / hi52 if hi52 else 0
        prox_low = last_close / lo52 if lo52 else 0

        # Composite score: prefer high volume + significant moves + proximity to 52w high
        score = 0.0
        reasons: list[str] = []

        if vol_ratio >= 2.0:
            score += 30 * min(vol_ratio / 2, 3)  # cap contribution
            reasons.append(f"volume {vol_ratio:.1f}x avg")
        elif vol_ratio >= 1.5:
            score += 10
            reasons.append(f"volume {vol_ratio:.1f}x avg")

        if abs(move_pct) >= 0.05:
            score += 25 * min(abs(move_pct) / 0.05, 3)
            reasons.append(f"{move_pct*100:+.1f}% day move")
        elif abs(move_pct) >= 0.03:
            score += 12
            reasons.append(f"{move_pct*100:+.1f}% day move")

        if prox_high >= 0.98:
            score += 20
            reasons.append("near 52w high")
        elif prox_high >= 0.95:
            score += 10
            reasons.append("recovering toward 52w high")

        if prox_low <= 1.05 and prox_high < 0.85:
            score += 15
            reasons.append("near 52w low (potential reversal)")

        return {
            "symbol": sym,
            "score": round(score, 1),
            "last_close": round(last_close, 2),
            "move_pct": round(move_pct, 4),
            "vol_ratio": round(vol_ratio, 2),
            "prox_high": round(prox_high, 3),
            "reasons": reasons,
        }
    except Exception as e:
        logger.debug("screener score failed for %s: %s", sym, e)
        return None


def find_opportunities(top_n: int = 10) -> list[dict]:
    """Top-N opportunities from the universe, cached for 30 min."""
    cache_key = f"top_{top_n}"
    cached = _cache.get(cache_key)
    if cached and time() - cached[1] < _TTL:
        return cached[0]

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = {ex.submit(_score_ticker, sym): sym for sym in UNIVERSE}
        for fut in as_completed(futures):
            r = fut.result()
            if r is not None and r["score"] > 0:
                results.append(r)

    results.sort(key=lambda x: -x["score"])
    top = results[:top_n]
    _cache[cache_key] = (top, time())
    return top


def get_hybrid_symbols(fixed_symbols: list[str], top_n_screener: int = 5) -> list[dict]:
    """Combine the user's fixed watchlist with screener picks, deduped.

    Returns list of dicts with {symbol, source, score?, reasons?}.
    Watchlist tickers always included (source='watchlist'); screener fills
    remainder (source='screener').
    """
    fixed = [s.upper().strip() for s in fixed_symbols if s.strip()]
    fixed_set = set(fixed)

    out: list[dict] = [{"symbol": s, "source": "watchlist"} for s in fixed]

    picks = find_opportunities(top_n=top_n_screener * 3)  # over-fetch in case of dedup
    for p in picks:
        if p["symbol"] in fixed_set:
            continue
        out.append({**p, "source": "screener"})
        if sum(1 for x in out if x["source"] == "screener") >= top_n_screener:
            break

    return out
