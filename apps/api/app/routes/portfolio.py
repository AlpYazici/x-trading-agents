import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import ClosedPosition, get_session
from ..services import alpaca_client, auto_kill, snapshots, holdings as holdings_svc

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("")
def get_portfolio() -> dict:
    snapshots.maybe_snapshot()  # opportunistic time-series capture
    auto_kill_state = auto_kill.check_daily_loss()
    return {
        "account": alpaca_client.get_account_snapshot(),
        "positions": alpaca_client.get_positions(),
        "auto_kill": auto_kill_state,
    }


@router.get("/history")
def get_history(
    days: int = 30,
    period: str | None = None,
    interval: str = "1d",
    backfill: bool = True,
):
    """Historical portfolio value.

    Args:
        days: shorthand — used only when `period` is None
        period: yfinance period ("1d", "5d", "1mo", "3mo", "1y", "5y")
        interval: yfinance interval ("5m", "15m", "1h", "1d", "1wk")
        backfill: True = compute from yfinance OHLC; False = stored snapshots
    """
    if backfill:
        return snapshots.get_backfilled_history(days=days, period=period, interval=interval)
    return snapshots.get_history(days=days)


@router.post("/snapshot")
def force_snapshot():
    """Force a portfolio snapshot now (bypasses 30-min throttle)."""
    snapshots.SNAPSHOT_INTERVAL_MIN = 0  # type: ignore
    written = snapshots.maybe_snapshot()
    snapshots.SNAPSHOT_INTERVAL_MIN = 30  # type: ignore
    return {"snapshotted": written}


# --- Closed positions (realized P/L + tax tracking) ---

class ClosedIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    exchange: str = "US"
    qty: float = Field(gt=0)
    entry_price: float = Field(gt=0)
    exit_price: float = Field(gt=0)
    currency: str = "USD"
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None


@router.get("/closed")
def list_closed(session: Session = Depends(get_session)):
    rows = session.exec(
        select(ClosedPosition).order_by(ClosedPosition.closed_at.desc())  # type: ignore[arg-type]
    ).all()
    return rows


@router.post("/closed")
def add_closed(body: ClosedIn, session: Session = Depends(get_session)):
    realized = (body.exit_price - body.entry_price) * body.qty
    fx = holdings_svc.fx_rate(body.currency, "USD") or 1.0
    realized_usd = realized * fx
    cp = ClosedPosition(
        symbol=body.symbol.upper(),
        exchange=body.exchange,
        qty=body.qty,
        entry_price=body.entry_price,
        exit_price=body.exit_price,
        currency=body.currency,
        opened_at=body.opened_at,
        closed_at=body.closed_at or datetime.utcnow(),
        realized_pl=realized,
        realized_pl_usd=realized_usd,
        fx_rate=fx,
        notes=body.notes,
    )
    session.add(cp)
    session.commit()
    session.refresh(cp)
    return cp


@router.delete("/closed/{closed_id}")
def delete_closed(closed_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClosedPosition, closed_id)
    if not cp:
        raise HTTPException(404, "not found")
    session.delete(cp)
    session.commit()
    return {"deleted": closed_id}


@router.get("/closed/csv")
def closed_csv(session: Session = Depends(get_session)):
    rows = session.exec(
        select(ClosedPosition).order_by(ClosedPosition.closed_at)  # type: ignore[arg-type]
    ).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "symbol", "exchange", "qty", "entry_price", "exit_price", "currency",
        "opened_at", "closed_at", "realized_pl", "realized_pl_usd", "fx_rate", "notes",
    ])
    for r in rows:
        w.writerow([
            r.symbol, r.exchange, r.qty, r.entry_price, r.exit_price, r.currency,
            r.opened_at.isoformat(), r.closed_at.isoformat(),
            f"{r.realized_pl:.4f}", f"{r.realized_pl_usd:.4f}", f"{r.fx_rate:.6f}",
            r.notes or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="closed_positions.csv"'},
    )
