from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import yfinance as yf

from ..services.holdings import yf_symbol
from tradingagents.dataflows.y_finance import _resolve_symbol

router = APIRouter(prefix="/ohlc", tags=["ohlc"])


def _resolve_yf(symbol: str, exchange: str) -> str:
    """Map (symbol, exchange) → yfinance symbol with international fallback.

    yf_symbol handles known mappings (BIST→.IS, CRYPTO→-USD). _resolve_symbol
    then probes bare + international suffixes if the user mistagged exchange
    (e.g. exchange=US but symbol is PGSUS, a BIST ticker). For already-qualified
    symbols (.IS, -USD, ^GSPC, =F) _resolve_symbol short-circuits and returns
    the input unchanged.
    """
    return _resolve_symbol(yf_symbol(symbol, exchange))


class Bar(BaseModel):
    time: int  # unix seconds
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


_VALID_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
_VALID_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}


class Quote(BaseModel):
    symbol: str
    last: float | None
    prev_close: float | None
    change: float | None
    change_pct: float | None
    sparkline: list[float] = []  # last ~30 closes for mini chart


@router.get("/quote")
def get_quote(
    symbol: str = Query(..., min_length=1),
    exchange: str = Query("US"),
):
    """Light-weight quote: last price + 1d change + tiny sparkline."""
    yf_sym = _resolve_yf(symbol, exchange)
    try:
        h = yf.Ticker(yf_sym).history(period="5d", interval="1d")
    except Exception as e:
        raise HTTPException(502, f"yfinance error for {yf_sym}: {e}")
    if len(h) == 0:
        return Quote(symbol=yf_sym, last=None, prev_close=None, change=None, change_pct=None)

    closes = [float(c) for c in h["Close"].tolist()]
    last = closes[-1]
    prev = closes[-2] if len(closes) >= 2 else None
    change = (last - prev) if prev is not None else None
    change_pct = (change / prev) if (change is not None and prev) else None
    return Quote(
        symbol=yf_sym,
        last=last,
        prev_close=prev,
        change=change,
        change_pct=change_pct,
        sparkline=closes[-30:],
    )


@router.get("", response_model=list[Bar])
def get_ohlc(
    symbol: str = Query(..., min_length=1),
    exchange: str = Query("US"),
    period: str = Query("3mo"),
    interval: str = Query("1d"),
):
    if period not in _VALID_PERIODS:
        raise HTTPException(400, f"period must be one of {sorted(_VALID_PERIODS)}")
    if interval not in _VALID_INTERVALS:
        raise HTTPException(400, f"interval must be one of {sorted(_VALID_INTERVALS)}")

    yf_sym = _resolve_yf(symbol, exchange)
    try:
        h = yf.Ticker(yf_sym).history(period=period, interval=interval)
    except Exception as e:
        raise HTTPException(502, f"yfinance error for {yf_sym}: {e}")

    if len(h) == 0:
        raise HTTPException(404, f"no data for {yf_sym} (period={period}, interval={interval})")

    bars: list[Bar] = []
    for ts, row in h.iterrows():
        bars.append(
            Bar(
                time=int(ts.timestamp()),  # type: ignore[union-attr]
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"]) if "Volume" in row else None,
            )
        )
    return bars
