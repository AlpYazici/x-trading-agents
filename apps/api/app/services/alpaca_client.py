"""Thin wrapper around alpaca-py.

Single TradingClient instance for the configured mode (paper vs live).
Live mode requires settings.alpaca_live=True. Default is paper. Never
flip the default.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
from alpaca.trading.requests import (
    LimitOrderRequest,
    MarketOrderRequest,
    StopLossRequest,
    TakeProfitRequest,
)

from ..config import settings

logger = logging.getLogger(__name__)


# Known crypto symbols (Alpaca-style with slash). The slash detector below
# is the primary check; this list is a fallback for raw symbols a user
# might type without the quote currency.
KNOWN_CRYPTO_BASES = {
    "BTC", "ETH", "SOL", "XRP", "DOGE", "AVAX", "LTC", "BCH",
    "LINK", "UNI", "AAVE", "MATIC", "DOT", "SHIB", "USDT", "USDC",
}


def is_crypto_symbol(s: str) -> bool:
    """Crypto symbols are formatted as BASE/QUOTE on Alpaca (e.g. BTC/USD)."""
    if not s:
        return False
    s = s.strip().upper()
    if "/" in s:
        return True
    return s in KNOWN_CRYPTO_BASES


@lru_cache(maxsize=1)
def get_client() -> Optional[TradingClient]:
    if not settings.alpaca_api_key or not settings.alpaca_secret_key:
        logger.warning("alpaca keys not configured; client disabled")
        return None
    paper = not settings.alpaca_live
    logger.info("alpaca client initialized: paper=%s", paper)
    return TradingClient(
        api_key=settings.alpaca_api_key,
        secret_key=settings.alpaca_secret_key,
        paper=paper,
    )


def get_account_snapshot() -> dict:
    client = get_client()
    if client is None:
        return {"configured": False}
    try:
        a = client.get_account()
    except Exception as e:
        return {"configured": True, "error": f"{type(e).__name__}: {e}"}
    return {
        "configured": True,
        "paper": not settings.alpaca_live,
        "cash": float(a.cash),
        "equity": float(a.equity),
        "buying_power": float(a.buying_power),
        "pattern_day_trader": bool(a.pattern_day_trader),
        "daytrade_count": int(a.daytrade_count),
    }


def get_positions() -> list[dict]:
    client = get_client()
    if client is None:
        return []
    try:
        positions = client.get_all_positions()
    except Exception as e:
        logger.warning("alpaca positions fetch failed: %s", e)
        return []
    out = []
    for p in positions:
        out.append({
            "symbol": p.symbol,
            "qty": float(p.qty),
            "avg_entry_price": float(p.avg_entry_price),
            "current_price": float(p.current_price) if p.current_price else None,
            "market_value": float(p.market_value) if p.market_value else None,
            "unrealized_pl": float(p.unrealized_pl) if p.unrealized_pl else None,
            "unrealized_plpc": float(p.unrealized_plpc) if p.unrealized_plpc else None,
            "side": p.side.value if hasattr(p.side, "value") else str(p.side),
        })
    return out


def submit_bracket_market_buy(
    symbol: str, qty: float, take_profit: float, stop_loss: float
) -> dict:
    client = get_client()
    if client is None:
        raise RuntimeError("alpaca client not configured")
    if is_crypto_symbol(symbol):
        raise ValueError(
            f"bracket orders not supported for crypto symbol {symbol!r}; "
            "use submit_crypto_market_buy for crypto"
        )
    req = MarketOrderRequest(
        symbol=symbol,
        qty=qty,
        side=OrderSide.BUY,
        time_in_force=TimeInForce.DAY,
        order_class=OrderClass.BRACKET,
        take_profit=TakeProfitRequest(limit_price=round(take_profit, 2)),
        stop_loss=StopLossRequest(stop_price=round(stop_loss, 2)),
    )
    order = client.submit_order(order_data=req)
    return _serialize(order)


def submit_market_sell(symbol: str, qty: float) -> dict:
    """Close-only market sell. Used for SELL signal on existing position."""
    client = get_client()
    if client is None:
        raise RuntimeError("alpaca client not configured")
    req = MarketOrderRequest(
        symbol=symbol,
        qty=qty,
        side=OrderSide.SELL,
        time_in_force=TimeInForce.DAY,
    )
    order = client.submit_order(order_data=req)
    return _serialize(order)


def submit_crypto_market_buy(symbol: str, qty: float) -> dict:
    """Simple crypto market buy — bracket orders are not supported for crypto.

    TimeInForce must be GTC or IOC for crypto. We use GTC.
    """
    client = get_client()
    if client is None:
        raise RuntimeError("alpaca client not configured")
    req = MarketOrderRequest(
        symbol=symbol,
        qty=qty,
        side=OrderSide.BUY,
        time_in_force=TimeInForce.GTC,
    )
    order = client.submit_order(order_data=req)
    return _serialize(order)


def submit_crypto_market_sell(symbol: str, qty: float) -> dict:
    """Simple crypto market sell. Crypto has no shorting — must hold position."""
    client = get_client()
    if client is None:
        raise RuntimeError("alpaca client not configured")
    req = MarketOrderRequest(
        symbol=symbol,
        qty=qty,
        side=OrderSide.SELL,
        time_in_force=TimeInForce.GTC,
    )
    order = client.submit_order(order_data=req)
    return _serialize(order)


def cancel_order(order_id: str) -> None:
    client = get_client()
    if client is None:
        return
    client.cancel_order_by_id(order_id)


def _serialize(o) -> dict:  # noqa: ANN001
    return {
        "id": str(o.id),
        "symbol": o.symbol,
        "qty": float(o.qty) if o.qty else None,
        "side": o.side.value if hasattr(o.side, "value") else str(o.side),
        "status": o.status.value if hasattr(o.status, "value") else str(o.status),
        "filled_qty": float(o.filled_qty) if o.filled_qty else 0.0,
        "filled_avg_price": float(o.filled_avg_price) if o.filled_avg_price else None,
        "order_class": o.order_class.value if hasattr(o.order_class, "value") else str(o.order_class),
        "submitted_at": str(o.submitted_at) if o.submitted_at else None,
    }
