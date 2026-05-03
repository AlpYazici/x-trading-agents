"""Congress + corporate insider trades for watchlist symbols."""
from fastapi import APIRouter, Query

from ..services import insider as insider_svc

router = APIRouter(prefix="/insider", tags=["insider"])


@router.get("")
def get_insider(symbol: str = Query(..., min_length=1)):
    sym = symbol.upper().strip()
    return {
        "house": insider_svc.get_house_trades_for_symbol(sym),
        "senate": insider_svc.get_senate_trades_for_symbol(sym),
        "corporate": insider_svc.get_corporate_insiders(sym),
    }


def _date_key(item: dict) -> str:
    """Sort key — string ISO dates compare correctly. Empty sorts last."""
    return item.get("transaction_date") or item.get("disclosure_date") or ""


@router.get("/multi")
def get_insider_multi(symbols: str = Query(..., description="comma-separated tickers")):
    """Merged feed across multiple symbols, newest first, capped at 50."""
    out: list[dict] = []
    for sym in [s.strip().upper() for s in symbols.split(",") if s.strip()]:
        out.extend(insider_svc.get_house_trades_for_symbol(sym))
        out.extend(insider_svc.get_senate_trades_for_symbol(sym))
        out.extend(insider_svc.get_corporate_insiders(sym))
    out.sort(key=_date_key, reverse=True)
    return out[:50]
