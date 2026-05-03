"""US Congress + corporate insider trades.

Data sources (all free, no API key):
- House Stock Watcher S3 JSON (US House Reps trades)
- Senate Stock Watcher S3 JSON (US Senators trades)
- yfinance Ticker.insider_transactions (corporate officer/director trades)

S3 datasets are ~10MB and update slowly — fetched once per 24h, cached
in module-level state. Per-symbol filtering happens against the cached
data, so per-call latency stays in milliseconds after first warmup.
"""
from __future__ import annotations

import logging
import threading
from functools import lru_cache
from time import time
from typing import Any

import httpx
import yfinance as yf

logger = logging.getLogger(__name__)

HOUSE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
SENATE_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json"

_CACHE_TTL = 24 * 3600  # 24h

# Module-level cache: {url: (timestamp, data)}
_s3_cache: dict[str, tuple[float, list[dict]]] = {}
_s3_lock = threading.Lock()


def _fetch_s3_json(url: str) -> list[dict]:
    """Fetch large S3 JSON, with 24h in-memory cache."""
    now = time()
    with _s3_lock:
        cached = _s3_cache.get(url)
        if cached and (now - cached[0]) < _CACHE_TTL:
            return cached[1]
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, list):
                logger.warning("unexpected S3 payload shape from %s", url)
                data = []
    except Exception as e:
        logger.warning("S3 fetch failed %s: %s", url, e)
        # Return stale cache if we have it, otherwise empty.
        with _s3_lock:
            cached = _s3_cache.get(url)
            return cached[1] if cached else []
    with _s3_lock:
        _s3_cache[url] = (now, data)
    return data


def _parse_amount(amount: str | None) -> tuple[float | None, float | None]:
    """Parse '$15,001 - $50,000' → (15001.0, 50000.0). Tolerates many shapes."""
    if not amount or not isinstance(amount, str):
        return (None, None)
    s = amount.replace("$", "").replace(",", "").strip()
    if "-" in s:
        parts = [p.strip() for p in s.split("-", 1)]
        try:
            lo = float(parts[0]) if parts[0] else None
            hi = float(parts[1]) if parts[1] else None
            return (lo, hi)
        except ValueError:
            return (None, None)
    try:
        v = float(s)
        return (v, v)
    except ValueError:
        return (None, None)


def _normalize_tx_type(t: str | None) -> str:
    """Map raw transaction strings to 'buy' | 'sell' | other."""
    if not t:
        return "unknown"
    s = t.lower()
    if "purchase" in s or "buy" in s:
        return "buy"
    if "sale" in s or "sell" in s:
        return "sell"
    if "exchange" in s:
        return "exchange"
    return s[:20]


def _symbol_matches(query: str, ticker: str | None, asset_desc: str | None) -> bool:
    """Case-insensitive contains match on either ticker or company description.

    Congress filings are noisy: NVDA may appear as 'NVDIA' or just in the
    asset description. We match if the query string is a substring of either,
    or the ticker startswith query.
    """
    if not query:
        return False
    q = query.upper().strip()
    if ticker:
        t = str(ticker).upper().strip().rstrip(".")
        if t == q or t.startswith(q) or q.startswith(t) and len(t) >= 2:
            return True
        if q in t:
            return True
    if asset_desc:
        d = str(asset_desc).upper()
        if q in d:
            return True
    return False


def get_house_trades_for_symbol(symbol: str) -> list[dict]:
    """House Reps trades matching the given symbol."""
    rows = _fetch_s3_json(HOUSE_URL)
    out: list[dict] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        ticker = r.get("ticker")
        asset = r.get("asset_description") or r.get("asset")
        if not _symbol_matches(symbol, ticker, asset):
            continue
        lo, hi = _parse_amount(r.get("amount"))
        out.append({
            "source": "house",
            "person": r.get("representative") or r.get("name"),
            "role": "House Rep",
            "ticker": (ticker or symbol).upper() if ticker else symbol.upper(),
            "transaction_type": _normalize_tx_type(r.get("type") or r.get("transaction_type")),
            "amount_min": lo,
            "amount_max": hi,
            "transaction_date": r.get("transaction_date"),
            "disclosure_date": r.get("disclosure_date"),
            "comment": r.get("comment") or r.get("ptr_link"),
        })
    return out


def get_senate_trades_for_symbol(symbol: str) -> list[dict]:
    """Senate trades matching the given symbol."""
    rows = _fetch_s3_json(SENATE_URL)
    out: list[dict] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        ticker = r.get("ticker")
        asset = r.get("asset_description") or r.get("asset_details") or r.get("asset")
        if not _symbol_matches(symbol, ticker, asset):
            continue
        lo, hi = _parse_amount(r.get("amount"))
        out.append({
            "source": "senate",
            "person": r.get("senator") or r.get("name"),
            "role": "Senator",
            "ticker": (ticker or symbol).upper() if ticker else symbol.upper(),
            "transaction_type": _normalize_tx_type(r.get("type") or r.get("transaction_type")),
            "amount_min": lo,
            "amount_max": hi,
            "transaction_date": r.get("transaction_date"),
            "disclosure_date": r.get("disclosure_date"),
            "comment": r.get("comment") or r.get("ptr_link"),
        })
    return out


@lru_cache(maxsize=64)
def _corporate_cached(symbol: str, ts_bucket: int) -> list[dict]:
    """yfinance corporate insider transactions, cached per hour."""
    try:
        df = yf.Ticker(symbol).insider_transactions
    except Exception as e:
        logger.warning("corporate insiders fetch failed for %s: %s", symbol, e)
        return []
    if df is None or getattr(df, "empty", True):
        return []
    out: list[dict] = []
    try:
        records = df.to_dict("records")
    except Exception:
        return []
    for r in records:
        # yfinance columns vary across versions: Insider, Position, URL,
        # Transaction, Text, Start Date / Date, Ownership, Shares, Value.
        person = r.get("Insider") or r.get("Name")
        role = r.get("Position") or r.get("Relation") or "Insider"
        raw_tx = r.get("Transaction") or r.get("Text") or ""
        ttype = _normalize_tx_type(str(raw_tx))
        date = r.get("Start Date") or r.get("Date")
        if hasattr(date, "isoformat"):
            try:
                date = date.isoformat()[:10]
            except Exception:
                date = str(date)
        elif date is not None:
            date = str(date)[:10]
        value = r.get("Value")
        try:
            v = float(value) if value is not None else None
        except (TypeError, ValueError):
            v = None
        out.append({
            "source": "corporate",
            "person": str(person) if person else None,
            "role": str(role),
            "ticker": symbol.upper(),
            "transaction_type": ttype,
            "amount_min": v,
            "amount_max": v,
            "transaction_date": date,
            "disclosure_date": date,
            "comment": str(raw_tx) if raw_tx else None,
        })
    return out


def get_corporate_insiders(symbol: str) -> list[dict]:
    return _corporate_cached(symbol.upper(), int(time() // 3600))
