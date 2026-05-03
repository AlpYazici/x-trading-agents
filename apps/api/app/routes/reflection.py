"""Reflection dashboard — surfaces TradingAgents decision history & win rate."""

from collections import Counter
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from tradingagents.agents.utils.memory import TradingMemoryLog
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter(prefix="/reflection", tags=["reflection"])


class ReflectionEntry(BaseModel):
    ticker: str
    date: str
    rating: Optional[str] = None
    status: str  # "pending" | "resolved"
    decision: str
    raw_return: Optional[float] = None
    alpha_return: Optional[float] = None
    holding_days: Optional[int] = None
    reflection: Optional[str] = None


class ReflectionResponse(BaseModel):
    entries: list[ReflectionEntry]
    stats: dict


def _parse_pct(value: Optional[str]) -> Optional[float]:
    """Parse strings like "+5.2%" / "-1.0%" into a float (0.052 / -0.010)."""
    if not value:
        return None
    try:
        return float(value.strip().rstrip("%")) / 100.0
    except ValueError:
        return None


def _parse_holding(value: Optional[str]) -> Optional[int]:
    """Parse holding strings like "7d" into integer days."""
    if not value:
        return None
    try:
        return int(value.strip().rstrip("d"))
    except ValueError:
        return None


def _to_entry(raw: dict) -> ReflectionEntry:
    return ReflectionEntry(
        ticker=raw.get("ticker", ""),
        date=raw.get("date", ""),
        rating=raw.get("rating") or None,
        status="pending" if raw.get("pending") else "resolved",
        decision=raw.get("decision", ""),
        raw_return=_parse_pct(raw.get("raw")),
        alpha_return=_parse_pct(raw.get("alpha")),
        holding_days=_parse_holding(raw.get("holding")),
        reflection=raw.get("reflection") or None,
    )


def _empty_stats() -> dict:
    return {
        "total": 0,
        "pending": 0,
        "resolved": 0,
        "wins": 0,
        "losses": 0,
        "win_rate": 0.0,
        "avg_return": 0.0,
        "avg_alpha": 0.0,
        "by_rating": {},
    }


def _compute_stats(entries: list[ReflectionEntry]) -> dict:
    if not entries:
        return _empty_stats()

    pending = [e for e in entries if e.status == "pending"]
    resolved = [e for e in entries if e.status == "resolved"]

    returns = [e.raw_return for e in resolved if e.raw_return is not None]
    alphas = [e.alpha_return for e in resolved if e.alpha_return is not None]
    wins = sum(1 for r in returns if r > 0)
    losses = sum(1 for r in returns if r < 0)
    decided = wins + losses  # excludes break-even (== 0)

    by_rating: Counter[str] = Counter()
    for e in entries:
        by_rating[e.rating or "Unknown"] += 1

    return {
        "total": len(entries),
        "pending": len(pending),
        "resolved": len(resolved),
        "wins": wins,
        "losses": losses,
        "win_rate": (wins / decided) if decided else 0.0,
        "avg_return": (sum(returns) / len(returns)) if returns else 0.0,
        "avg_alpha": (sum(alphas) / len(alphas)) if alphas else 0.0,
        "by_rating": dict(by_rating),
    }


@router.get("", response_model=ReflectionResponse)
def get_reflection() -> ReflectionResponse:
    log = TradingMemoryLog(DEFAULT_CONFIG)
    raw_entries = log.load_entries()
    entries = [_to_entry(r) for r in raw_entries]
    return ReflectionResponse(entries=entries, stats=_compute_stats(entries))
