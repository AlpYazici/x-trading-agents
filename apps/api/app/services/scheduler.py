"""APScheduler-driven cron jobs for batch agent runs.

Each `Schedule` row in the DB maps to one APScheduler job (id = f"sched_{id}").
When the job fires, we re-load the Schedule (so edits to symbols/cron without
re-registering still take effect for the symbols list), parse symbols, and call
`manager.start()` for each ticker on today's date.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from ..db import Schedule, engine
from .run_manager import manager

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


def _job_id(schedule_id: int) -> str:
    return f"sched_{schedule_id}"


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


def parse_symbols(csv: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in (csv or "").split(","):
        s = raw.strip().upper()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def next_run_for(schedule_id: int) -> Optional[datetime]:
    sched = get_scheduler()
    job = sched.get_job(_job_id(schedule_id))
    if job is None:
        return None
    return job.next_run_time


async def _fire(schedule_id: int) -> None:
    """Job body: look up schedule, kick off a run per symbol, update timestamps."""
    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is None:
            logger.warning("scheduled job fired but schedule %s missing; unregistering", schedule_id)
            unregister_schedule(schedule_id)
            return
        if not row.enabled:
            return
        symbols = parse_symbols(row.symbols)
        name = row.name

    if not symbols:
        logger.warning("schedule %s (%s) has no symbols; skipping", schedule_id, name)
        return

    td = date.today().isoformat()
    started = 0
    failed: list[str] = []
    for sym in symbols:
        try:
            await manager.start(sym, td)
            started += 1
        except Exception:
            logger.exception("schedule %s: failed to start run for %s", schedule_id, sym)
            failed.append(sym)

    logger.info("schedule %s (%s) fired: started=%d failed=%s", schedule_id, name, started, failed)

    with Session(engine) as s:
        row = s.get(Schedule, schedule_id)
        if row is not None:
            row.last_run_at = datetime.utcnow()
            row.next_run_at = next_run_for(schedule_id)
            s.add(row)
            s.commit()


def register_schedule(schedule: Schedule) -> None:
    """Add or replace the cron job for this schedule. No-op if disabled."""
    if schedule.id is None:
        raise ValueError("schedule must be persisted before registering")

    sched = get_scheduler()
    jid = _job_id(schedule.id)

    # Always remove the existing one so cron/timezone changes take effect.
    if sched.get_job(jid) is not None:
        sched.remove_job(jid)

    if not schedule.enabled:
        return

    trigger = CronTrigger.from_crontab(schedule.cron, timezone=schedule.timezone)
    sched.add_job(
        _fire,
        trigger=trigger,
        id=jid,
        args=[schedule.id],
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
        max_instances=1,
    )

    # Persist next_run_at for UI visibility.
    job = sched.get_job(jid)
    if job is not None:
        with Session(engine) as s:
            row = s.get(Schedule, schedule.id)
            if row is not None:
                row.next_run_at = job.next_run_time
                s.add(row)
                s.commit()


def unregister_schedule(schedule_id: int) -> None:
    sched = get_scheduler()
    jid = _job_id(schedule_id)
    if sched.get_job(jid) is not None:
        sched.remove_job(jid)


def seed_default_schedules() -> None:
    """First-run setup: 2 daily scans (pre-market + post-close ET).

    Times chosen for a Turkey-based user (UTC+3):
      - 09:00 ET = 16:00 Istanbul (afternoon)
      - 16:30 ET = 23:30 Istanbul (late evening)

    Watchlist defaults to the 5 highest-volume megacap tech tickers; user can
    edit symbols + cron via the /schedules page.
    """
    with Session(engine) as s:
        existing = s.exec(select(Schedule)).all()
        if existing:
            return  # don't seed if user already has schedules
        defaults = [
            Schedule(
                name="Daily pre-market scan",
                symbols="NVDA,AAPL,MSFT,META,TSLA",
                cron="0 9 * * 1-5",
                timezone="America/New_York",
                enabled=True,
                notes="Auto-seeded on first start. Edit on /schedules.",
            ),
            Schedule(
                name="Daily post-close scan",
                symbols="NVDA,AAPL,MSFT,META,TSLA",
                cron="30 16 * * 1-5",
                timezone="America/New_York",
                enabled=True,
                notes="Auto-seeded on first start. Edit on /schedules.",
            ),
        ]
        for d in defaults:
            s.add(d)
        s.commit()
        logger.info("seeded %d default schedules", len(defaults))


def start_scheduler() -> None:
    sched = get_scheduler()
    if sched.running:
        return
    sched.start()

    # First-run seed (if no schedules exist).
    try:
        seed_default_schedules()
    except Exception:
        logger.exception("seed_default_schedules failed")

    # Re-register all enabled schedules.
    with Session(engine) as s:
        rows = s.exec(select(Schedule).where(Schedule.enabled == True)).all()  # noqa: E712
    for row in rows:
        try:
            register_schedule(row)
        except Exception:
            logger.exception("failed to register schedule %s on startup", row.id)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
