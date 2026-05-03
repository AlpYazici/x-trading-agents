"""Manual portfolio holdings + live price fetching via yfinance."""
from __future__ import annotations

import logging
from functools import lru_cache
from time import time
from typing import Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# Symbol normalization for yfinance
_SUFFIX = {
    "US": "",
    "BIST": ".IS",
    "CRYPTO": "-USD",
}


def yf_symbol(symbol: str, exchange: str) -> str:
    sym = symbol.strip()
    # Pass through already-qualified yfinance symbols (indices ^GSPC, futures CL=F,
    # FX EURUSD=X, dotted suffixes RYGYO.IS, dashed crypto ETH-USD).
    if any(c in sym for c in ("^", "=", ".", "/")) or sym.endswith("-USD"):
        return sym.upper()
    sym = sym.upper()
    suf = _SUFFIX.get(exchange.upper(), "")
    if suf and not sym.endswith(suf):
        return sym + suf
    return sym


_price_cache: dict[str, tuple[float, float]] = {}  # symbol -> (price, ts)
_PRICE_TTL = 30.0  # seconds


def get_price(symbol: str, exchange: str) -> Optional[float]:
    """Fetch live price with 30s cache. Returns None on failure."""
    yf_sym = yf_symbol(symbol, exchange)
    now = time()
    cached = _price_cache.get(yf_sym)
    if cached and now - cached[1] < _PRICE_TTL:
        return cached[0]

    try:
        t = yf.Ticker(yf_sym)
        # try fast_info first (no network for some)
        try:
            p = float(t.fast_info.last_price)
            if p > 0:
                _price_cache[yf_sym] = (p, now)
                return p
        except Exception:
            pass
        # fallback: history
        h = t.history(period="1d", interval="1m")
        if len(h) > 0:
            p = float(h["Close"].iloc[-1])
            _price_cache[yf_sym] = (p, now)
            return p
    except Exception as e:
        logger.warning("price fetch failed for %s (%s): %s", yf_sym, exchange, e)
    return None


@lru_cache(maxsize=8)
def _fx_cached(pair: str, ts_bucket: int) -> Optional[float]:
    """FX cached per 60s bucket."""
    try:
        h = yf.Ticker(pair).history(period="1d")
        if len(h) > 0:
            return float(h["Close"].iloc[-1])
    except Exception as e:
        logger.warning("fx fetch failed for %s: %s", pair, e)
    return None


def fx_rate(from_ccy: str, to_ccy: str = "USD") -> Optional[float]:
    """Get FX rate. Returns 1.0 for same currency."""
    if from_ccy == to_ccy:
        return 1.0
    pair = f"{from_ccy}{to_ccy}=X"
    rate = _fx_cached(pair, int(time() // 60))
    if rate:
        return rate
    # try inverse
    inv_pair = f"{to_ccy}{from_ccy}=X"
    inv = _fx_cached(inv_pair, int(time() // 60))
    if inv and inv > 0:
        return 1.0 / inv
    return None
