from datetime import datetime
from pathlib import Path
from typing import Optional
from sqlmodel import Field, SQLModel, create_engine, Session

from .config import settings


class Run(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str
    trade_date: str
    status: str = "pending"
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    final_decision: Optional[str] = None
    signal: Optional[str] = None
    error: Optional[str] = None


class RunEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    node: str
    event_type: str
    payload: str


class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: Optional[int] = Field(default=None, foreign_key="run.id", index=True)
    alpaca_order_id: Optional[str] = Field(default=None, index=True)
    symbol: str
    side: str
    qty: float
    order_class: str
    entry_price: Optional[float] = None
    stop_price: Optional[float] = None
    take_profit_price: Optional[float] = None
    status: str = "pending_approval"
    submitted_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    filled_qty: Optional[float] = None
    filled_avg_price: Optional[float] = None
    paper: bool = True
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Holding(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    exchange: str = "US"  # US, BIST, CRYPTO
    qty: float
    entry_price: float
    currency: str = "USD"  # USD, TRY, EUR
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PortfolioSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)
    total_usd: float
    total_pl_usd: float
    holdings_count: int
    breakdown: str  # JSON: [{"symbol":..,"value_usd":..,"pl_usd":..}, ...]


class ClosedPosition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    exchange: str = "US"
    qty: float
    entry_price: float
    exit_price: float
    currency: str = "USD"
    opened_at: datetime
    closed_at: datetime = Field(default_factory=datetime.utcnow)
    realized_pl: float       # in native currency
    realized_pl_usd: float   # converted to USD via FX at close time
    fx_rate: float = 1.0
    notes: Optional[str] = None


class KillSwitch(SQLModel, table=True):
    id: Optional[int] = Field(default=1, primary_key=True)
    engaged: bool = False
    reason: Optional[str] = None
    engaged_at: Optional[datetime] = None


class LlmCost(SQLModel, table=True):
    """Per-run token usage and cost estimate."""
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: Optional[int] = Field(default=None, foreign_key="run.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    cost_usd: float = 0.0


class Schedule(SQLModel, table=True):
    """Scheduled batch analysis (e.g. every weekday at 9:30 ET, scan watchlist)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    symbols: str  # comma-separated
    cron: str  # cron expression, e.g. "30 9 * * 1-5"
    timezone: str = "America/New_York"
    enabled: bool = True
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(f"sqlite:///{settings.db_path}", echo=False)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        if not s.get(KillSwitch, 1):
            s.add(KillSwitch(id=1, engaged=False))
            s.commit()


def get_session():
    with Session(engine) as session:
        yield session
