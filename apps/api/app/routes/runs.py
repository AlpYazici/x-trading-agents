import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from ..db import Run, get_session
from ..services.run_manager import manager
from ..services import rate_limit

router = APIRouter(prefix="/runs", tags=["runs"])


class StartRunRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    trade_date: str | None = None


@router.post("")
async def start_run(req: StartRunRequest):
    ok, info = rate_limit.check_and_consume(1)
    if not ok:
        raise HTTPException(429, f"daily run limit reached ({info['used_24h']}/{info['limit']}). Resets at {info['reset_at']}")
    td = req.trade_date or date.today().isoformat()
    run_id = await manager.start(req.ticker, td)
    return {"run_id": run_id, "ticker": req.ticker.upper(), "trade_date": td, "rate_limit": info}


@router.get("")
def list_runs(session: Session = Depends(get_session), limit: int = 50):
    rows = session.exec(select(Run).order_by(Run.id.desc()).limit(limit)).all()  # type: ignore[arg-type]
    return rows


@router.get("/{run_id}")
def get_run(run_id: int, session: Session = Depends(get_session)):
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    return run


@router.get("/{run_id}/events")
async def stream_events(run_id: int):
    queue = await manager.subscribe(run_id)

    async def gen():
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": "{}"}
                continue
            import json as _j

            yield {"event": msg["event"], "data": _j.dumps(msg["data"], default=str)}
            if msg["event"] == "done":
                break

    return EventSourceResponse(gen())
