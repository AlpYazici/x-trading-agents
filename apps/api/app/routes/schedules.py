from datetime import date, datetime
from typing import Optional

from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import Schedule, engine
from ..services import scheduler as scheduler_svc
from ..services.run_manager import manager

router = APIRouter(prefix="/schedules", tags=["schedules"])


class ScheduleIn(BaseModel):
    name: str = Field(min_length=1)
    symbols: list[str] = Field(min_length=1)
    cron: str = Field(min_length=1)
    timezone: str = "America/New_York"
    enabled: bool = True
    notes: Optional[str] = None


class ScheduleOut(BaseModel):
    id: int
    name: str
    symbols: list[str]
    cron: str
    timezone: str
    enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    notes: str | None


def _validate_cron(expr: str, tz: str) -> None:
    try:
        CronTrigger.from_crontab(expr, timezone=tz)
    except Exception as e:
        raise HTTPException(400, f"invalid cron expression: {e}")


def _normalize_symbols(syms: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in syms:
        s = raw.strip().upper()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    if not out:
        raise HTTPException(400, "no valid symbols provided")
    return out


def _to_out(row: Schedule) -> ScheduleOut:
    assert row.id is not None
    return ScheduleOut(
        id=row.id,
        name=row.name,
        symbols=scheduler_svc.parse_symbols(row.symbols),
        cron=row.cron,
        timezone=row.timezone,
        enabled=row.enabled,
        last_run_at=row.last_run_at,
        next_run_at=scheduler_svc.next_run_for(row.id) or row.next_run_at,
        notes=row.notes,
    )


@router.get("", response_model=list[ScheduleOut])
def list_schedules() -> list[ScheduleOut]:
    with Session(engine) as s:
        rows = s.exec(select(Schedule).order_by(Schedule.created_at.desc())).all()  # type: ignore[attr-defined]
    return [_to_out(r) for r in rows]


@router.post("", response_model=ScheduleOut)
def create_schedule(body: ScheduleIn) -> ScheduleOut:
    syms = _normalize_symbols(body.symbols)
    _validate_cron(body.cron, body.timezone)

    with Session(engine) as s:
        row = Schedule(
            name=body.name.strip(),
            symbols=",".join(syms),
            cron=body.cron.strip(),
            timezone=body.timezone,
            enabled=body.enabled,
            notes=body.notes,
        )
        s.add(row)
        s.commit()
        s.refresh(row)

    scheduler_svc.register_schedule(row)
    with Session(engine) as s:
        row = s.get(Schedule, row.id)  # re-load for next_run_at
        assert row is not None
        return _to_out(row)


@router.put("/{schedule_id}", response_model=ScheduleOut)
def update_schedule(schedule_id: int, body: ScheduleIn) -> ScheduleOut:
    syms = _normalize_symbols(body.symbols)
    _validate_cron(body.cron, body.timezone)

    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is None:
            raise HTTPException(404, "schedule not found")
        row.name = body.name.strip()
        row.symbols = ",".join(syms)
        row.cron = body.cron.strip()
        row.timezone = body.timezone
        row.enabled = body.enabled
        row.notes = body.notes
        s.add(row)
        s.commit()
        s.refresh(row)

    scheduler_svc.register_schedule(row)
    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        assert row is not None
        return _to_out(row)


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int) -> dict:
    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is None:
            raise HTTPException(404, "schedule not found")
        s.delete(row)
        s.commit()
    scheduler_svc.unregister_schedule(schedule_id)
    return {"ok": True}


@router.post("/{schedule_id}/toggle", response_model=ScheduleOut)
def toggle_schedule(schedule_id: int) -> ScheduleOut:
    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is None:
            raise HTTPException(404, "schedule not found")
        row.enabled = not row.enabled
        s.add(row)
        s.commit()
        s.refresh(row)

    if row.enabled:
        scheduler_svc.register_schedule(row)
    else:
        scheduler_svc.unregister_schedule(schedule_id)

    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        assert row is not None
        return _to_out(row)


class RunNowResponse(BaseModel):
    run_ids: list[int]
    started: int
    failed: list[str]


@router.post("/{schedule_id}/run-now", response_model=RunNowResponse)
async def run_now(schedule_id: int) -> RunNowResponse:
    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is None:
            raise HTTPException(404, "schedule not found")
        symbols = scheduler_svc.parse_symbols(row.symbols)

    if not symbols:
        raise HTTPException(400, "schedule has no symbols")

    td = date.today().isoformat()
    run_ids: list[int] = []
    failed: list[str] = []
    for sym in symbols:
        try:
            rid = await manager.start(sym, td)
            run_ids.append(rid)
        except Exception:
            failed.append(sym)

    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is not None:
            row.last_run_at = datetime.utcnow()
            s.add(row)
            s.commit()

    return RunNowResponse(run_ids=run_ids, started=len(run_ids), failed=failed)
