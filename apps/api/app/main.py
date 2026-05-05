import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routes import runs as runs_routes
from .routes import portfolio as portfolio_routes
from .routes import trades as trades_routes
from .routes import safety as safety_routes
from .routes import holdings as holdings_routes
from .routes import ohlc as ohlc_routes
from .routes import markets as markets_routes
from .routes import batch as batch_routes
from .routes import reflection as reflection_routes
from .routes import costs as costs_routes
from .routes import schedules as schedules_routes
from .routes import insider as insider_routes
from .routes import backtest as backtest_routes
from .routes import screener as screener_routes
from .routes import attribution as attribution_routes
from .services import scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="trading-agents-claude API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    # langchain_anthropic + alpaca-py-via-env-vars read os.environ, not pydantic.
    # Push settings → environ so the worker thread sees them.
    import os
    if settings.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key

    # Recover from crashes: any run still marked "running" is orphaned (worker died).
    # If a checkpoint exists for it, AUTO-RESUME by relaunching the worker.
    # Otherwise mark as failed.
    from datetime import datetime
    from pathlib import Path
    from sqlmodel import Session, select
    from .db import Run, engine
    from .services.run_manager import manager
    from tradingagents.default_config import DEFAULT_CONFIG
    import asyncio
    import logging

    log = logging.getLogger(__name__)

    cache_dir = DEFAULT_CONFIG.get("data_cache_dir") or str(Path.home() / ".tradingagents" / "cache")
    checkpoints_dir = Path(cache_dir) / "checkpoints"

    def _has_checkpoint(ticker: str) -> bool:
        # LangGraph SqliteSaver stores per-ticker checkpoint files under checkpoints_dir
        if not checkpoints_dir.exists():
            return False
        for f in checkpoints_dir.iterdir():
            if ticker.lower() in f.name.lower():
                return True
        return False

    with Session(engine) as s:
        orphans = s.exec(select(Run).where(Run.status == "running")).all()  # type: ignore[arg-type]
        to_resume: list[tuple[int, str, str]] = []
        for r in orphans:
            if _has_checkpoint(r.ticker):
                # Keep status running, will resume below
                log.info("auto-resume queued for run #%s %s (%s)", r.id, r.ticker, r.trade_date)
                to_resume.append((r.id, r.ticker, r.trade_date))
            else:
                r.status = "failed"
                r.error = "API restarted before run completed; no checkpoint found"
                r.finished_at = datetime.utcnow()
                s.add(r)
        if orphans:
            s.commit()

    # Schedule auto-resume tasks AFTER the event loop is running
    if to_resume:
        async def _resume_all():
            await asyncio.sleep(2)  # let app finish startup
            for run_id, ticker, trade_date in to_resume:
                try:
                    await manager.resume(run_id, ticker, trade_date)
                    log.info("resumed run #%s %s", run_id, ticker)
                except Exception:
                    log.exception("resume failed for run #%s", run_id)
        loop = asyncio.get_event_loop()
        loop.create_task(_resume_all())

    # Cron-driven batch scans (re-registers all enabled Schedule rows).
    scheduler.start_scheduler()


@app.on_event("shutdown")
def _shutdown() -> None:
    scheduler.stop_scheduler()


@app.get("/health")
def health() -> dict:
    from .services import rate_limit
    return {
        "ok": True,
        "live_mode": settings.alpaca_live,
        "manual_approval": settings.alpaca_manual_approval,
        "rate_limit": {
            "used_24h": rate_limit.runs_today(),
            "limit": settings.run_rate_limit_per_day,
            "remaining": rate_limit.remaining(),
        },
    }


app.include_router(runs_routes.router)
app.include_router(portfolio_routes.router)
app.include_router(trades_routes.router)
app.include_router(safety_routes.router)
app.include_router(holdings_routes.router)
app.include_router(ohlc_routes.router)
app.include_router(markets_routes.router)
app.include_router(batch_routes.router)
app.include_router(reflection_routes.router)
app.include_router(costs_routes.router)
app.include_router(schedules_routes.router)
app.include_router(insider_routes.router)
app.include_router(backtest_routes.router)
app.include_router(screener_routes.router)
app.include_router(attribution_routes.router)
