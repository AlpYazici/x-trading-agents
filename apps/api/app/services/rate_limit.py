"""Daily run rate limit (cost safety)."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from ..config import settings
from ..db import Run, engine


def runs_today() -> int:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    with Session(engine) as s:
        rows = s.exec(select(Run).where(Run.started_at >= cutoff)).all()  # type: ignore[arg-type]
        return len(rows)


def remaining() -> int:
    return max(0, settings.run_rate_limit_per_day - runs_today())


def check_and_consume(n: int = 1) -> tuple[bool, dict]:
    """Returns (allowed, info). info has used/limit/remaining/reset_at."""
    used = runs_today()
    limit = settings.run_rate_limit_per_day
    remaining_q = max(0, limit - used)
    info = {
        "used_24h": used,
        "limit": limit,
        "remaining": remaining_q,
        "reset_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
    }
    if used + n > limit:
        return False, info
    return True, info
