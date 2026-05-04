"""News, earnings, sector performance — markets context endpoints."""
from fastapi import APIRouter, Query
from ..services import news as news_svc
from ..services import company as company_svc

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("/profile")
def get_profile(symbol: str = Query(..., min_length=1), exchange: str = "US"):
    """Company info + ratios (P/E, margins, ROE, dividend, analyst targets, etc).

    Cached 1h server-side. Powers the company detail panel on /chart.
    """
    return company_svc.get_profile(symbol, exchange)


@router.get("/financials")
def get_financials(symbol: str = Query(..., min_length=1), exchange: str = "US"):
    """Annual + quarterly revenue / gross profit / operating income / net income / EBITDA / EPS.

    Cached 12h. Frontend renders historical bar charts.
    """
    return company_svc.get_financials(symbol, exchange)


@router.get("/news")
def get_news(symbol: str = Query(..., min_length=1), exchange: str = "US"):
    return news_svc.get_news(symbol, exchange)


@router.get("/news/multi")
def get_news_multi(symbols: str = Query(..., description="comma-separated"), exchange: str = "US"):
    """Fetch news for multiple symbols, return merged feed sorted by date."""
    out = []
    for sym in [s.strip() for s in symbols.split(",") if s.strip()]:
        for n in news_svc.get_news(sym, exchange):
            out.append({**n, "symbol": sym})
    # Sort by published_at desc if present
    def _ts(item):
        v = item.get("published_at")
        if isinstance(v, (int, float)):
            return v
        return 0
    out.sort(key=_ts, reverse=True)
    return out[:50]


@router.get("/earnings")
def get_earnings(symbol: str = Query(..., min_length=1), exchange: str = "US"):
    return news_svc.get_earnings(symbol, exchange)


@router.get("/earnings/multi")
def get_earnings_multi(symbols: str = Query(..., description="comma-separated"), exchange: str = "US"):
    out = []
    for sym in [s.strip() for s in symbols.split(",") if s.strip()]:
        e = news_svc.get_earnings(sym, exchange)
        if e:
            out.append(e)
    return out


# S&P sector ETFs (SPDR Select Sector)
SECTOR_ETFS = [
    {"label": "Tech",                 "symbol": "XLK"},
    {"label": "Communication",        "symbol": "XLC"},
    {"label": "Cons. Discretionary",  "symbol": "XLY"},
    {"label": "Cons. Staples",        "symbol": "XLP"},
    {"label": "Financials",           "symbol": "XLF"},
    {"label": "Healthcare",           "symbol": "XLV"},
    {"label": "Industrials",          "symbol": "XLI"},
    {"label": "Energy",               "symbol": "XLE"},
    {"label": "Utilities",            "symbol": "XLU"},
    {"label": "Real Estate",          "symbol": "XLRE"},
    {"label": "Materials",            "symbol": "XLB"},
]


@router.get("/sectors")
def get_sectors():
    """List of S&P sector ETF symbols. Use /ohlc/quote to get prices."""
    return SECTOR_ETFS
