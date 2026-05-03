from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.run_manager import manager
from ..services import rate_limit

router = APIRouter(prefix="/runs", tags=["runs"])

MAX_BATCH = 20


class BatchRunRequest(BaseModel):
    tickers: list[str] = Field(min_length=1)
    trade_date: str | None = None


class BatchRunResponse(BaseModel):
    run_ids: list[int]
    started: int
    failed: list[str]


@router.post("/batch", response_model=BatchRunResponse)
async def start_batch(req: BatchRunRequest) -> BatchRunResponse:
    # Normalize + dedupe (preserving order) + drop empties.
    seen: set[str] = set()
    tickers: list[str] = []
    for raw in req.tickers:
        t = raw.strip().upper()
        if not t or t in seen:
            continue
        seen.add(t)
        tickers.append(t)

    if not tickers:
        raise HTTPException(400, "no valid tickers provided")
    if len(tickers) > MAX_BATCH:
        raise HTTPException(400, f"batch exceeds max of {MAX_BATCH} tickers")

    # Daily rate limit check (cost safety)
    ok, info = rate_limit.check_and_consume(len(tickers))
    if not ok:
        raise HTTPException(
            429,
            f"daily run limit would be exceeded: {info['used_24h']}/{info['limit']} used, "
            f"requesting {len(tickers)} more. Resets at {info['reset_at']}",
        )

    td = req.trade_date or date.today().isoformat()

    run_ids: list[int] = []
    failed: list[str] = []
    for ticker in tickers:
        try:
            run_id = await manager.start(ticker, td)
            run_ids.append(run_id)
        except Exception:
            failed.append(ticker)

    return BatchRunResponse(run_ids=run_ids, started=len(run_ids), failed=failed)
