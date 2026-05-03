"""Maps a TradingAgents decision to a risk-gated, optionally-approved order."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import yfinance as yf
from sqlmodel import Session, select

from ..config import settings
from ..db import Order, Run, engine
from . import alpaca_client, auto_kill, risk

logger = logging.getLogger(__name__)


def _to_yf_symbol(symbol: str) -> str:
    """Map an Alpaca symbol to yfinance format.

    Alpaca crypto: BTC/USD, ETH/USD, SOL/USD
    yfinance crypto: BTC-USD, ETH-USD, SOL-USD
    Stocks pass through unchanged.
    """
    s = symbol.strip().upper()
    if "/" in s:
        return s.replace("/", "-")
    return s


def _last_price(symbol: str) -> Optional[float]:
    yf_sym = _to_yf_symbol(symbol)
    try:
        t = yf.Ticker(yf_sym)
        info = t.fast_info
        price = float(info.last_price)
        if price > 0:
            return price
    except Exception:
        pass
    try:
        h = yf.Ticker(yf_sym).history(period="1d")
        if len(h) > 0:
            return float(h["Close"].iloc[-1])
    except Exception as e:
        logger.warning("could not fetch price for %s: %s", yf_sym, e)
    return None


def _extract_action(decision_text: str) -> str:
    text = (decision_text or "").upper()
    for tag in ("BUY", "SELL", "HOLD"):
        if tag in text:
            return tag
    return "HOLD"


def stage_from_run(run_id: int) -> dict:
    """Risk-check a run's decision and persist a pending_approval order.
    Returns the order dict. Does NOT submit. Use approve_order() to submit.
    """
    with Session(engine) as s:
        run = s.get(Run, run_id)
        if not run:
            raise ValueError(f"run {run_id} not found")
        if run.status != "completed":
            raise ValueError(f"run {run_id} status is {run.status}, expected completed")

        action = _extract_action(run.final_decision or run.signal or "")
        if action == "HOLD":
            order = Order(
                run_id=run_id,
                symbol=run.ticker,
                side="hold",
                qty=0,
                order_class="none",
                status="hold",
                paper=not settings.alpaca_live,
            )
            s.add(order)
            s.commit()
            s.refresh(order)
            return order.model_dump()

        price = _last_price(run.ticker)
        if price is None:
            order = Order(
                run_id=run_id,
                symbol=run.ticker,
                side=action.lower(),
                qty=0,
                order_class="bracket" if action == "BUY" else "market",
                status="rejected",
                rejection_reason="no price available",
                paper=not settings.alpaca_live,
            )
            s.add(order)
            s.commit()
            s.refresh(order)
            return order.model_dump()

        if action == "BUY":
            d = risk.check_buy(run.ticker, price)
        else:
            d = risk.check_sell(run.ticker)

        if not d.ok:
            order = Order(
                run_id=run_id,
                symbol=run.ticker,
                side=action.lower(),
                qty=0,
                order_class="bracket" if action == "BUY" else "market",
                status="rejected",
                rejection_reason=d.reason,
                paper=not settings.alpaca_live,
            )
            s.add(order)
            s.commit()
            s.refresh(order)
            return order.model_dump()

        order = Order(
            run_id=run_id,
            symbol=run.ticker,
            side=action.lower(),
            qty=d.qty,
            order_class="bracket" if action == "BUY" else "market",
            entry_price=d.entry_estimate or price,
            stop_price=d.stop_loss or None,
            take_profit_price=d.take_profit or None,
            status="pending_approval" if settings.alpaca_manual_approval else "approved",
            paper=not settings.alpaca_live,
        )
        s.add(order)
        s.commit()
        s.refresh(order)
        out = order.model_dump()

    if not settings.alpaca_manual_approval:
        out = approve_order(out["id"])
    return out


def approve_order(order_id: int) -> dict:
    with Session(engine) as s:
        order = s.get(Order, order_id)
        if not order:
            raise ValueError(f"order {order_id} not found")
        if order.status not in ("pending_approval", "approved"):
            raise ValueError(f"order status {order.status} not approvable")

        auto_kill.check_daily_loss()  # may engage kill switch based on current P/L
        ks = risk.kill_switch_state()
        if ks.engaged:
            order.status = "rejected"
            order.rejection_reason = f"kill switch engaged: {ks.reason}"
            s.add(order)
            s.commit()
            s.refresh(order)
            return order.model_dump()

        try:
            crypto = alpaca_client.is_crypto_symbol(order.symbol)
            if order.side == "buy":
                if crypto:
                    resp = alpaca_client.submit_crypto_market_buy(
                        symbol=order.symbol, qty=order.qty,
                    )
                else:
                    resp = alpaca_client.submit_bracket_market_buy(
                        symbol=order.symbol,
                        qty=order.qty,
                        take_profit=order.take_profit_price,  # type: ignore[arg-type]
                        stop_loss=order.stop_price,  # type: ignore[arg-type]
                    )
            elif order.side == "sell":
                if crypto:
                    resp = alpaca_client.submit_crypto_market_sell(
                        symbol=order.symbol, qty=order.qty,
                    )
                else:
                    resp = alpaca_client.submit_market_sell(symbol=order.symbol, qty=order.qty)
            else:
                raise ValueError(f"cannot submit side={order.side}")
            order.alpaca_order_id = resp["id"]
            order.status = "submitted"
            order.submitted_at = datetime.utcnow()
        except Exception as e:
            order.status = "rejected"
            order.rejection_reason = f"broker error: {type(e).__name__}: {e}"
            logger.exception("submit failed for order %s", order_id)

        s.add(order)
        s.commit()
        s.refresh(order)
        return order.model_dump()


def reject_order(order_id: int, reason: str) -> dict:
    with Session(engine) as s:
        order = s.get(Order, order_id)
        if not order:
            raise ValueError(f"order {order_id} not found")
        order.status = "rejected"
        order.rejection_reason = reason
        s.add(order)
        s.commit()
        s.refresh(order)
        return order.model_dump()


def _crypto_auto_size(symbol: str, current_price: float) -> risk.RiskDecision:
    """Crypto sizing — same risk-dollar logic as risk.check_buy but allows
    fractional qty (a single BTC share doesn't exist).

    Crypto skips the integer-share floor and the bracket fields (no brackets
    for crypto), but still respects: kill switch, daily order cap, account
    config, equity > 0, max position cap, and buying power.
    """
    ks = risk.kill_switch_state()
    if ks.engaged:
        return risk.RiskDecision(ok=False, reason=f"kill switch engaged: {ks.reason}")
    # mirror risk.check_buy's daily order check
    if risk._orders_today() >= settings.risk_max_orders_per_day:
        return risk.RiskDecision(ok=False, reason="daily order limit reached")

    snap = alpaca_client.get_account_snapshot()
    if not snap.get("configured"):
        return risk.RiskDecision(ok=False, reason="alpaca not configured")
    equity = float(snap["equity"])
    if equity <= 0:
        return risk.RiskDecision(ok=False, reason="zero equity")

    risk_dollars = equity * settings.risk_per_trade_pct
    stop_distance = current_price * settings.risk_stop_loss_pct
    if stop_distance <= 0:
        return risk.RiskDecision(ok=False, reason="invalid stop distance")

    qty_by_risk = risk_dollars / stop_distance
    max_position_dollars = equity * settings.risk_max_position_pct
    qty_by_position = max_position_dollars / current_price
    qty = min(qty_by_risk, qty_by_position)
    # round to 8 decimals (typical crypto precision); keep fractional
    qty = round(qty, 8)

    if qty * current_price < 1.0:
        return risk.RiskDecision(ok=False, reason=f"sized below $1 notional minimum (qty={qty})")

    if qty * current_price > snap["buying_power"]:
        return risk.RiskDecision(ok=False, reason="insufficient buying power")

    return risk.RiskDecision(ok=True, qty=qty, entry_estimate=current_price)


def create_manual_order(
    symbol: str,
    side: str,
    qty: float | None = None,
    stop_price: float | None = None,
    take_profit_price: float | None = None,
) -> dict:
    """User-initiated order (not from a run). Goes through the same risk gate.

    Crypto symbols (containing '/') route through a crypto path that skips
    bracket fields (Alpaca does not support brackets for crypto) and allows
    fractional qty. If the user passed stop/tp on a crypto symbol, those are
    ignored and a warning is included in the returned dict.
    """
    side = side.lower()
    if side not in ("buy", "sell"):
        raise ValueError("side must be buy or sell")

    sym = symbol.upper().strip()
    price = _last_price(sym)
    if price is None:
        raise ValueError(f"no price available for {sym}")

    auto_kill.check_daily_loss()  # may engage kill switch based on current P/L

    is_crypto = alpaca_client.is_crypto_symbol(sym)
    warning: str | None = None

    if is_crypto and (stop_price is not None or take_profit_price is not None):
        warning = "crypto orders do not support brackets; stop/take-profit ignored"
        stop_price = None
        take_profit_price = None

    # Auto-size via risk gate if qty not given
    if side == "buy":
        if qty is None:
            if is_crypto:
                d = _crypto_auto_size(sym, price)
            else:
                d = risk.check_buy(sym, price)
            if not d.ok:
                with Session(engine) as s:
                    order = Order(
                        symbol=sym, side="buy", qty=0,
                        order_class="market" if is_crypto else "bracket",
                        status="rejected", rejection_reason=d.reason,
                        paper=not settings.alpaca_live,
                    )
                    s.add(order); s.commit(); s.refresh(order)
                    out = order.model_dump()
                    if warning:
                        out["warning"] = warning
                    return out
            qty = d.qty
            if not is_crypto:
                stop_price = stop_price or d.stop_loss
                take_profit_price = take_profit_price or d.take_profit
        else:
            # User specified qty — still check kill switch + buying power
            ks = risk.kill_switch_state()
            if ks.engaged:
                raise ValueError(f"kill switch engaged: {ks.reason}")
            if not is_crypto:
                stop_price = stop_price or price * (1 - settings.risk_stop_loss_pct)
                take_profit_price = take_profit_price or price * (1 + settings.risk_take_profit_pct)
    else:
        # SELL — must have position (handled by Alpaca, but we sanity-check)
        if qty is None:
            d = risk.check_sell(sym)
            if not d.ok:
                with Session(engine) as s:
                    order = Order(
                        symbol=sym, side="sell", qty=0,
                        order_class="market",
                        status="rejected", rejection_reason=d.reason,
                        paper=not settings.alpaca_live,
                    )
                    s.add(order); s.commit(); s.refresh(order)
                    out = order.model_dump()
                    if warning:
                        out["warning"] = warning
                    return out
            qty = d.qty

    if is_crypto:
        order_class = "market"
    else:
        order_class = "bracket" if side == "buy" else "market"

    with Session(engine) as s:
        order = Order(
            symbol=sym, side=side, qty=qty,
            order_class=order_class,
            entry_price=price,
            stop_price=stop_price,
            take_profit_price=take_profit_price,
            status="pending_approval" if settings.alpaca_manual_approval else "approved",
            paper=not settings.alpaca_live,
        )
        s.add(order); s.commit(); s.refresh(order)
        out = order.model_dump()

    if not settings.alpaca_manual_approval:
        out = approve_order(out["id"])
    if warning:
        out["warning"] = warning
    return out


def list_orders(limit: int = 100) -> list[dict]:
    with Session(engine) as s:
        rows = s.exec(select(Order).order_by(Order.id.desc()).limit(limit)).all()  # type: ignore[arg-type]
        return [r.model_dump() for r in rows]
