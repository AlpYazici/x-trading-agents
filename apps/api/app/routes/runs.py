import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from fastapi.responses import StreamingResponse

from ..db import Run, RunEvent, get_session
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


@router.get("/{run_id}/scratchpad")
def export_scratchpad(run_id: int, session: Session = Depends(get_session)):
    """Export every event for a run as JSONL (one JSON per line).

    Inspired by virattt/dexter — each line is a self-contained event with
    timestamp, node, type, and the full payload that the agent emitted.
    Useful for debugging, archival, sharing, and post-hoc analysis.
    """
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    events = session.exec(
        select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.id)  # type: ignore[arg-type]
    ).all()

    def _gen():
        import json as _j
        # First line: a header with run metadata so the file is self-describing.
        header = {
            "type": "init",
            "run_id": run.id,
            "ticker": run.ticker,
            "trade_date": run.trade_date,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "signal": run.signal,
        }
        yield _j.dumps(header) + "\n"
        for e in events:
            try:
                payload = _j.loads(e.payload)
            except Exception:
                payload = e.payload
            line = {
                "ts": e.ts.isoformat() + "Z" if e.ts else None,
                "node": e.node,
                "type": e.event_type,
                "data": payload,
            }
            yield _j.dumps(line, default=str) + "\n"

    fname = f"run-{run_id}-{run.ticker}-{run.trade_date}.jsonl"
    return StreamingResponse(
        _gen(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{run_id}/events")
async def stream_events(run_id: int):
    queue = await manager.subscribe(run_id)

    async def gen():
        # Initial ping primes the connection so reverse proxies (Cloudflare,
        # Next.js rewrites) flush the response start immediately instead of
        # waiting for buffer fill.
        yield {"event": "ping", "data": "{}"}
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                # Frequent pings keep proxies awake and prevent idle timeouts.
                yield {"event": "ping", "data": "{}"}
                continue
            import json as _j

            yield {"event": msg["event"], "data": _j.dumps(msg["data"], default=str)}
            if msg["event"] == "done":
                break

    # Headers prevent buffering at every layer (Cloudflare, Next.js, browsers):
    return EventSourceResponse(
        gen(),
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Content-Encoding": "identity",
        },
    )
