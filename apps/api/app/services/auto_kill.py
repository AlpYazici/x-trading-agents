"""Auto-engage the kill switch when intraday loss exceeds the configured limit.

Reads from PortfolioSnapshot (written by snapshots.maybe_snapshot()). The
"day" boundary is UTC midnight, matching how PortfolioSnapshot.ts is stored.
"""
from __future__ import annotations

from datetime import datetime, time, timezone

from sqlmodel import Session, select

from ..config import settings
from ..db import PortfolioSnapshot, engine
from . import risk


def check_daily_loss() -> dict:
    """Compute today's P/L % vs the start-of-day snapshot; engage kill switch on breach.

    Returns a dict describing the state. `triggered` is True only when this
    call engaged the kill switch (not when it was already engaged).
    """
    start_of_day = datetime.combine(datetime.utcnow().date(), time.min)

    with Session(engine) as s:
        first = s.exec(
            select(PortfolioSnapshot)
            .where(PortfolioSnapshot.ts >= start_of_day)
            .order_by(PortfolioSnapshot.ts)  # type: ignore[arg-type]
            .limit(1)
        ).first()
        latest = s.exec(
            select(PortfolioSnapshot)
            .where(PortfolioSnapshot.ts >= start_of_day)
            .order_by(PortfolioSnapshot.ts.desc())  # type: ignore[arg-type]
            .limit(1)
        ).first()

    if first is None or latest is None or first.id == latest.id:
        # Need at least two distinct snapshots today to measure intraday change.
        return {
            "triggered": False,
            "day_pl_pct": None,
            "first_value": first.total_usd if first else None,
            "latest_value": latest.total_usd if latest else None,
        }

    if first.total_usd <= 0:
        return {
            "triggered": False,
            "day_pl_pct": None,
            "first_value": first.total_usd,
            "latest_value": latest.total_usd,
        }

    day_pl_pct = (latest.total_usd - first.total_usd) / first.total_usd
    limit = settings.risk_daily_loss_limit_pct

    triggered = False
    if day_pl_pct < -limit:
        ks = risk.kill_switch_state()
        if not ks.engaged:
            risk.engage_kill_switch(
                f"daily loss limit hit: {day_pl_pct*100:.2f}% (limit -{limit*100}%)"
            )
            triggered = True

    return {
        "triggered": triggered,
        "day_pl_pct": day_pl_pct,
        "first_value": first.total_usd,
        "latest_value": latest.total_usd,
    }
