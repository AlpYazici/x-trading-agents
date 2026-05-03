"""Server-side risk gate. Every order goes through check_order().

Limits are read from settings (env vars). Kill switch is sticky in the DB.

DESIGN INVARIANT: this is the ONLY path that approves order placement.
Bypassing this gate is a bug. Live trading depends on it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlmodel import Session, select

from ..config import settings
from ..db import KillSwitch, Order, engine
from . import alpaca_client


@dataclass
class RiskDecision:
    ok: bool
    reason: str = ""
    qty: float = 0.0
    take_profit: float = 0.0
    stop_loss: float = 0.0
    entry_estimate: float = 0.0


def kill_switch_state() -> KillSwitch:
    with Session(engine) as s:
        ks = s.get(KillSwitch, 1)
        if ks is None:
            ks = KillSwitch(id=1, engaged=False)
            s.add(ks)
            s.commit()
            s.refresh(ks)
        return ks


def engage_kill_switch(reason: str) -> None:
    with Session(engine) as s:
        ks = s.get(KillSwitch, 1) or KillSwitch(id=1)
        ks.engaged = True
        ks.reason = reason
        ks.engaged_at = datetime.utcnow()
        s.add(ks)
        s.commit()


def release_kill_switch() -> None:
    with Session(engine) as s:
        ks = s.get(KillSwitch, 1) or KillSwitch(id=1)
        ks.engaged = False
        ks.reason = None
        ks.engaged_at = None
        s.add(ks)
        s.commit()


def _orders_today() -> int:
    cutoff = datetime.utcnow() - timedelta(days=1)
    with Session(engine) as s:
        rows = s.exec(
            select(Order).where(Order.created_at >= cutoff)  # type: ignore[arg-type]
        ).all()
        return len(rows)


def _open_position_qty(symbol: str) -> float:
    for p in alpaca_client.get_positions():
        if p["symbol"].upper() == symbol.upper():
            return float(p["qty"])
    return 0.0


def check_buy(symbol: str, current_price: float) -> RiskDecision:
    """Decide whether to place a BUY and size it. Returns qty + bracket levels."""
    ks = kill_switch_state()
    if ks.engaged:
        return RiskDecision(ok=False, reason=f"kill switch engaged: {ks.reason}")

    if _orders_today() >= settings.risk_max_orders_per_day:
        return RiskDecision(ok=False, reason="daily order limit reached")

    snap = alpaca_client.get_account_snapshot()
    if not snap.get("configured"):
        return RiskDecision(ok=False, reason="alpaca not configured")

    equity = float(snap["equity"])
    if equity <= 0:
        return RiskDecision(ok=False, reason="zero equity")

    risk_dollars = equity * settings.risk_per_trade_pct
    stop_distance = current_price * settings.risk_stop_loss_pct
    if stop_distance <= 0:
        return RiskDecision(ok=False, reason="invalid stop distance")

    qty_by_risk = risk_dollars / stop_distance
    max_position_dollars = equity * settings.risk_max_position_pct
    qty_by_position = max_position_dollars / current_price
    qty = min(qty_by_risk, qty_by_position)
    qty = float(int(qty))

    if qty < 1:
        return RiskDecision(ok=False, reason=f"sized below 1 share (risk_per_trade={settings.risk_per_trade_pct}, equity={equity})")

    if qty * current_price > snap["buying_power"]:
        return RiskDecision(ok=False, reason="insufficient buying power")

    if snap["pattern_day_trader"] and equity < 25_000:
        return RiskDecision(ok=False, reason="PDT-restricted under $25k equity")

    take_profit = current_price * (1 + settings.risk_take_profit_pct)
    stop_loss = current_price * (1 - settings.risk_stop_loss_pct)

    return RiskDecision(
        ok=True,
        qty=qty,
        take_profit=take_profit,
        stop_loss=stop_loss,
        entry_estimate=current_price,
    )


def check_sell(symbol: str) -> RiskDecision:
    ks = kill_switch_state()
    if ks.engaged:
        return RiskDecision(ok=False, reason=f"kill switch engaged: {ks.reason}")
    qty = _open_position_qty(symbol)
    if qty <= 0:
        return RiskDecision(ok=False, reason="no open position to sell")
    return RiskDecision(ok=True, qty=qty)
