"""yfinance-backed news + earnings."""
from __future__ import annotations

import logging
from functools import lru_cache
from time import time

import yfinance as yf

from .holdings import yf_symbol

logger = logging.getLogger(__name__)


@lru_cache(maxsize=64)
def _news_cached(yf_sym: str, ts_bucket: int) -> list[dict]:
    """Cached per 5min bucket."""
    try:
        items = yf.Ticker(yf_sym).news or []
    except Exception as e:
        logger.warning("news fetch failed for %s: %s", yf_sym, e)
        return []
    out = []
    for it in items[:20]:
        # yfinance returns nested {"content": {...}} in newer versions
        c = it.get("content") or it
        out.append({
            "title": c.get("title") or it.get("title"),
            "summary": (c.get("summary") or "")[:500],
            "url": (c.get("clickThroughUrl") or {}).get("url")
                   or (c.get("canonicalUrl") or {}).get("url")
                   or it.get("link"),
            "publisher": (c.get("provider") or {}).get("displayName") or it.get("publisher"),
            "published_at": c.get("pubDate") or it.get("providerPublishTime"),
            "thumbnail": ((c.get("thumbnail") or {}).get("resolutions") or [{}])[0].get("url"),
        })
    return [n for n in out if n["title"]]


def get_news(symbol: str, exchange: str = "US") -> list[dict]:
    return _news_cached(yf_symbol(symbol, exchange), int(time() // 300))


@lru_cache(maxsize=64)
def _earnings_cached(yf_sym: str, ts_bucket: int) -> dict | None:
    """Earnings calendar entry, cached per hour."""
    try:
        cal = yf.Ticker(yf_sym).calendar
        if cal is None:
            return None
        # cal is dict-like in newer yfinance, DataFrame in older
        if hasattr(cal, "to_dict"):
            try:
                cal = cal.to_dict()
            except Exception:
                pass
        if isinstance(cal, dict):
            ed = cal.get("Earnings Date")
            if isinstance(ed, list) and ed:
                ed = ed[0]
            return {
                "symbol": yf_sym,
                "next_earnings": str(ed) if ed else None,
                "eps_estimate": cal.get("Earnings Average") or cal.get("EPS Estimate"),
                "eps_low": cal.get("Earnings Low"),
                "eps_high": cal.get("Earnings High"),
                "revenue_estimate": cal.get("Revenue Average"),
            }
    except Exception as e:
        logger.warning("earnings fetch failed for %s: %s", yf_sym, e)
    return None


def get_earnings(symbol: str, exchange: str = "US") -> dict | None:
    return _earnings_cached(yf_symbol(symbol, exchange), int(time() // 3600))
