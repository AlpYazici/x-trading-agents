"""Performance attribution: which tickers/sectors/signals does the agent
actually predict well? Aggregates over completed runs older than `min_age_days`.
"""
from fastapi import APIRouter, Query

from ..services import attribution

router = APIRouter(prefix="/attribution", tags=["attribution"])


@router.get("")
def get_attribution(
    holding_days: int = Query(5, ge=1, le=60, description="Forward-return window per signal"),
    min_age_days: int = Query(5, ge=1, le=365, description="Skip runs younger than this — outcome not yet decidable"),
):
    """Roll up backtest verdicts across all completed runs.

    Returns:
      - by_ticker: per-ticker win rate + avg return + avg alpha vs SPY
      - by_sector: per-sector win rate + avg alpha
      - by_signal: per BUY/SELL/HOLD bucket
      - outcomes: full per-run outcome list (for drill-down UIs)

    Cached server-side for 30 min — backtest verifier is yfinance-bound.
    """
    return attribution.get_attribution(holding_days=holding_days, min_age_days=min_age_days)
