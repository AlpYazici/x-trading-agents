"""Financial Datasets API client (https://financialdatasets.ai).

Used as a richer fallback for company.py when yfinance .info / .financials
return sparse data — especially common for non-US listings (BIST, LSE) and
for ratios yfinance doesn't expose (e.g. quarterly P/E history, segments).

The free tier covers AAPL/GOOGL/MSFT/NVDA/TSLA. Paid tier ($20/mo) unlocks
the full US universe. We never block on this key being absent — every helper
returns None when not configured so callers must merge gracefully.
"""
from __future__ import annotations

import logging
from time import time
from typing import Any, Optional

import requests

from ..config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.financialdatasets.ai"
_TIMEOUT = 8.0
_TTL = 60 * 60  # 1h cache, matches company.py


_snapshot_cache: dict[str, tuple[Optional[dict], float]] = {}
_metrics_cache: dict[tuple[str, str, int], tuple[list, float]] = {}


def _enabled() -> bool:
    return bool(settings.financial_datasets_api_key)


def _headers() -> dict[str, str]:
    return {"X-API-KEY": settings.financial_datasets_api_key}


def _get(path: str, params: dict[str, Any]) -> Optional[dict]:
    if not _enabled():
        return None
    try:
        r = requests.get(f"{API_BASE}{path}", params=params, headers=_headers(), timeout=_TIMEOUT)
        if r.status_code == 404:
            return None
        if r.status_code != 200:
            logger.warning("FD %s returned %s: %s", path, r.status_code, r.text[:200])
            return None
        return r.json()
    except Exception as e:
        logger.warning("FD %s request failed: %s", path, e)
        return None


def get_metrics_snapshot(ticker: str) -> Optional[dict]:
    """Single-row snapshot of ~80 financial ratios (P/E, ROE, margins, etc).

    Returns the `snapshot` dict directly; None if disabled or not found.
    """
    sym = ticker.upper().strip()
    now = time()
    cached = _snapshot_cache.get(sym)
    if cached and now - cached[1] < _TTL:
        return cached[0]

    data = _get("/financial-metrics/snapshot", {"ticker": sym})
    snap = data.get("snapshot") if isinstance(data, dict) else None
    _snapshot_cache[sym] = (snap, now)
    return snap


def get_income_statements(ticker: str, period: str = "quarterly", limit: int = 8) -> list[dict]:
    """Income statement history. period: 'annual' | 'quarterly' | 'ttm'."""
    sym = ticker.upper().strip()
    key = (sym, period, limit)
    now = time()
    cached = _metrics_cache.get(key)
    if cached and now - cached[1] < _TTL:
        return cached[0]

    data = _get("/financials/income-statements", {"ticker": sym, "period": period, "limit": limit})
    items = data.get("income_statements", []) if isinstance(data, dict) else []
    _metrics_cache[key] = (items, now)
    return items


def merge_into_profile(yf_profile: dict) -> dict:
    """Fill missing yfinance ratio fields from Financial Datasets snapshot.

    Only fills None / missing values — never overrides yfinance data that's
    already populated. Adds a `_data_sources` list so callers can see provenance.
    """
    if not _enabled():
        return yf_profile

    ticker = yf_profile.get("symbol") or ""
    # Strip any yfinance suffix — FD uses bare US tickers.
    if "." in ticker or "-" in ticker or "=" in ticker or "^" in ticker:
        return yf_profile  # FD only supports plain US tickers

    snap = get_metrics_snapshot(ticker)
    if not snap:
        return yf_profile

    # Map FD snapshot fields → our profile schema.
    fd_to_profile = {
        "market_cap": "market_cap",
        "enterprise_value": "enterprise_value",
        "price_to_earnings_ratio": "pe_trailing",
        "price_to_sales_ratio": "ps_trailing",
        "price_to_book_ratio": "pb",
        "enterprise_value_to_ebitda_ratio": "ev_ebitda",
        "enterprise_value_to_revenue_ratio": "ev_revenue",
        "peg_ratio": "peg",
        "gross_margin": "gross_margin",
        "operating_margin": "operating_margin",
        "net_margin": "profit_margin",
        "ebitda_margin": "ebitda_margin",
        "return_on_equity": "roe",
        "return_on_assets": "roa",
        "debt_to_equity": "debt_to_equity",
        "current_ratio": "current_ratio",
        "quick_ratio": "quick_ratio",
        "free_cash_flow_yield": None,  # no direct mapping
        "dividend_yield": "dividend_yield",
        "payout_ratio": "payout_ratio",
        "revenue_growth": "revenue_growth",
        "earnings_growth": "earnings_growth",
        "beta": "beta",
    }

    filled = 0
    for fd_key, our_key in fd_to_profile.items():
        if our_key is None:
            continue
        v = snap.get(fd_key)
        if v is None:
            continue
        if yf_profile.get(our_key) is None:
            yf_profile[our_key] = v
            filled += 1

    if filled:
        sources = yf_profile.setdefault("_data_sources", ["yfinance"])
        if "financial_datasets" not in sources:
            sources.append("financial_datasets")
        logger.debug("FD filled %d fields for %s", filled, ticker)

    return yf_profile
