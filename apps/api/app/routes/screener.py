from fastapi import APIRouter, Query
from ..services import screener

router = APIRouter(prefix="/screener", tags=["screener"])


@router.get("/top")
def top_opportunities(n: int = Query(10, ge=1, le=30)):
    """Top-N market opportunities ranked by composite score.

    Signals:
      - Volume spike vs 30-day avg
      - Day move (>3% absolute)
      - 52-week high/low proximity
    """
    return screener.find_opportunities(top_n=n)
