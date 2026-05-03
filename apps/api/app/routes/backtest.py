from fastapi import APIRouter, HTTPException, Query
from sqlmodel import Session

from ..db import Run, engine
from ..services import backtest as bt

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.get("/run/{run_id}")
def verify_run(run_id: int, holding_days: int = Query(5, ge=1, le=60)):
    """Compute actual forward return for a completed run."""
    with Session(engine) as s:
        run = s.get(Run, run_id)
        if not run:
            raise HTTPException(404, "run not found")
        if run.status != "completed":
            raise HTTPException(400, f"run not completed (status={run.status})")
        return bt.verify(run.ticker, run.trade_date, run.signal or "", holding_days=holding_days)


@router.get("/symbol")
def verify_symbol(
    symbol: str = Query(..., min_length=1),
    trade_date: str = Query(..., description="YYYY-MM-DD"),
    signal: str = Query(..., description="e.g. Overweight, BUY, SELL, HOLD"),
    holding_days: int = Query(5, ge=1, le=60),
):
    """Verify any (symbol, date, signal) combination — useful for hypothetical backtests."""
    return bt.verify(symbol.upper(), trade_date, signal, holding_days=holding_days)
