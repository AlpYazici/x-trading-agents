"""US Congress (House + Senate) stock trades — sourced from public S3 JSONs.

Same data the dashboard widget uses, but formatted as a Markdown report for
consumption by Claude analyst agents.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta
from time import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_HOUSE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
_SENATE_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json"

# In-process cache: {url: (data, fetched_at)}
_cache: dict[str, tuple[list[dict], float]] = {}
_cache_lock = threading.Lock()
_CACHE_TTL_SEC = 24 * 3600


def _fetch(url: str) -> list[dict]:
    with _cache_lock:
        cached = _cache.get(url)
        now = time()
        if cached and now - cached[1] < _CACHE_TTL_SEC:
            return cached[0]
    try:
        # S3 buckets need a real User-Agent — bare httpx UA returns 403
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; TradingAgents/0.2; +https://github.com/AlpYazici/TradingAgents)",
            "Accept": "application/json",
        }
        with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as c:
            r = c.get(url)
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, list):
                data = []
    except Exception as e:
        logger.warning("congress trades fetch failed for %s: %s", url, e)
        # Return stale cache rather than empty on failure
        with _cache_lock:
            cached = _cache.get(url)
            if cached:
                return cached[0]
        return []
    with _cache_lock:
        _cache[url] = (data, now)
    return data


def _matches_ticker(item: dict, ticker: str) -> bool:
    sym = (item.get("ticker") or "").upper().strip()
    if sym == ticker:
        return True
    desc = (item.get("asset_description") or "").upper()
    return ticker in desc


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19] if "T" in s else s[:10], fmt)
        except ValueError:
            continue
    return None


def _parse_amount(s: Any) -> tuple[float, float]:
    """Returns (low, high) USD bounds. Congress filings give ranges."""
    if isinstance(s, (int, float)):
        return float(s), float(s)
    if not s:
        return 0.0, 0.0
    txt = str(s).replace("$", "").replace(",", "").lower().strip()
    # e.g. "1,001 - 15,000" or "100k - 250k"
    if "-" in txt:
        parts = txt.split("-")
        if len(parts) == 2:
            return _parse_one(parts[0]), _parse_one(parts[1])
    v = _parse_one(txt)
    return v, v


def _parse_one(s: str) -> float:
    s = s.strip()
    if not s:
        return 0.0
    mult = 1.0
    if s.endswith("k"):
        mult = 1_000
        s = s[:-1]
    elif s.endswith("m"):
        mult = 1_000_000
        s = s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return 0.0


def get_congress_trades_summary(ticker: str, days_back: int = 90) -> str:
    """Markdown summary of US Congress trades for `ticker` in the last N days."""
    sym = ticker.upper().strip()
    # International tickers — no Congress trades possible
    if any(c in sym for c in (".", "=", "-")):
        return f"No US Congress trade data available for non-US ticker `{ticker}`."

    cutoff = datetime.utcnow() - timedelta(days=days_back)
    house = _fetch(_HOUSE_URL)
    senate = _fetch(_SENATE_URL)

    rows = []
    for kind, items in (("House", house), ("Senate", senate)):
        for it in items:
            if not _matches_ticker(it, sym):
                continue
            tx_date = _parse_date(it.get("transaction_date"))
            if tx_date is None or tx_date < cutoff:
                continue
            low, high = _parse_amount(it.get("amount"))
            tx_type = (it.get("type") or it.get("transaction_type") or "").lower()
            if "purchase" in tx_type or "buy" in tx_type:
                side = "BUY"
            elif "sale" in tx_type or "sell" in tx_type:
                side = "SELL"
            else:
                side = tx_type.upper() or "?"
            person = it.get("representative") or it.get("senator") or "Unknown"
            rows.append({
                "date": tx_date.strftime("%Y-%m-%d"),
                "person": person,
                "kind": kind,
                "side": side,
                "low": low,
                "high": high,
            })

    if not rows:
        return f"No US Congress trades disclosed for `{ticker}` in the last {days_back} days."

    rows.sort(key=lambda r: r["date"], reverse=True)
    rows = rows[:30]  # cap

    # Aggregate totals
    buy_low = sum(r["low"] for r in rows if r["side"] == "BUY")
    buy_high = sum(r["high"] for r in rows if r["side"] == "BUY")
    sell_low = sum(r["low"] for r in rows if r["side"] == "SELL")
    sell_high = sum(r["high"] for r in rows if r["side"] == "SELL")
    n_buy = sum(1 for r in rows if r["side"] == "BUY")
    n_sell = sum(1 for r in rows if r["side"] == "SELL")

    lines = [
        f"## US Congress trades for `{ticker}` — last {days_back} days",
        "",
        f"**Summary**: {n_buy} BUY trades (${buy_low:,.0f}–${buy_high:,.0f}), "
        f"{n_sell} SELL trades (${sell_low:,.0f}–${sell_high:,.0f})",
        "",
        "| Date | Person | Chamber | Side | Amount Range |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        amt = f"${r['low']:,.0f}–${r['high']:,.0f}"
        lines.append(f"| {r['date']} | {r['person']} | {r['kind']} | {r['side']} | {amt} |")

    if n_buy > n_sell * 2:
        lines.append("\n**Signal**: Predominantly buying — politicians may have positive view.")
    elif n_sell > n_buy * 2:
        lines.append("\n**Signal**: Predominantly selling — politicians may have negative view.")
    else:
        lines.append("\n**Signal**: Mixed — no clear directional bias from Congress activity.")

    return "\n".join(lines)
