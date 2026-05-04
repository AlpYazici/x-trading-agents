"""Company profile + financials helpers (yfinance-backed, in-memory cached).

Used by `/markets/profile` and `/markets/financials`. Yahoo's financial data
returns wide DataFrames keyed by report date; we slim them into the small
shapes the frontend actually renders.
"""
from __future__ import annotations

import logging
from time import time
from typing import Any

import pandas as pd
import yfinance as yf

from ..routes.ohlc import _resolve_yf  # symbol/exchange → yfinance ticker

logger = logging.getLogger(__name__)

# Profile data changes infrequently; cache aggressively.
_PROFILE_TTL = 60 * 60  # 1h
_FINANCIALS_TTL = 60 * 60 * 12  # 12h — quarterly figures don't move intraday
_profile_cache: dict[str, tuple[dict, float]] = {}
_financials_cache: dict[str, tuple[dict, float]] = {}


def _safe(d: dict, *keys: str, default: Any = None) -> Any:
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return default


def get_profile(symbol: str, exchange: str) -> dict:
    yf_sym = _resolve_yf(symbol, exchange)
    now = time()
    cached = _profile_cache.get(yf_sym)
    if cached and now - cached[1] < _PROFILE_TTL:
        return cached[0]

    try:
        t = yf.Ticker(yf_sym)
        info = t.info or {}
    except Exception as e:
        logger.warning("profile fetch failed for %s: %s", yf_sym, e)
        if cached:
            return cached[0]
        return {"symbol": yf_sym, "error": str(e)}

    out = {
        "symbol": yf_sym,
        "name": _safe(info, "longName", "shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "country": info.get("country"),
        "website": info.get("website"),
        "exchange": info.get("fullExchangeName") or info.get("exchange"),
        "currency": info.get("currency"),
        "summary": info.get("longBusinessSummary"),
        "employees": info.get("fullTimeEmployees"),
        "market_cap": info.get("marketCap"),
        "enterprise_value": info.get("enterpriseValue"),
        # Valuation
        "pe_trailing": info.get("trailingPE"),
        "pe_forward": info.get("forwardPE"),
        "ps_trailing": info.get("priceToSalesTrailing12Months"),
        "pb": info.get("priceToBook"),
        "ev_ebitda": info.get("enterpriseToEbitda"),
        "ev_revenue": info.get("enterpriseToRevenue"),
        "peg": info.get("pegRatio") or info.get("trailingPegRatio"),
        # Profitability
        "profit_margin": info.get("profitMargins"),
        "operating_margin": info.get("operatingMargins"),
        "gross_margin": info.get("grossMargins"),
        "ebitda_margin": info.get("ebitdaMargins"),
        "roe": info.get("returnOnEquity"),
        "roa": info.get("returnOnAssets"),
        # Balance sheet
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "quick_ratio": info.get("quickRatio"),
        "total_cash": info.get("totalCash"),
        "total_debt": info.get("totalDebt"),
        "free_cashflow": info.get("freeCashflow"),
        "operating_cashflow": info.get("operatingCashflow"),
        # Growth
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        # Dividend
        "dividend_yield": info.get("dividendYield"),
        "dividend_rate": info.get("dividendRate"),
        "payout_ratio": info.get("payoutRatio"),
        # Price refs
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "fifty_day_avg": info.get("fiftyDayAverage"),
        "two_hundred_day_avg": info.get("twoHundredDayAverage"),
        "beta": info.get("beta"),
        # Analyst
        "target_mean": info.get("targetMeanPrice"),
        "target_low": info.get("targetLowPrice"),
        "target_high": info.get("targetHighPrice"),
        "recommendation": info.get("recommendationKey"),
        "analyst_count": info.get("numberOfAnalystOpinions"),
        # Trading
        "shares_outstanding": info.get("sharesOutstanding"),
        "float_shares": info.get("floatShares"),
        "short_ratio": info.get("shortRatio"),
        "short_percent_of_float": info.get("shortPercentOfFloat"),
    }
    _profile_cache[yf_sym] = (out, now)
    return out


def _df_to_periods(df: pd.DataFrame, row_keys: list[str]) -> list[dict]:
    """Yahoo financials DataFrames have report-date columns (newest first)
    and metric rows. Pull the requested rows and return a chronological
    list of {date, <metric>: value} dicts."""
    if df is None or df.empty:
        return []
    # Columns are timestamps; sort ascending (oldest → newest)
    cols = sorted(df.columns)
    out: list[dict] = []
    for c in cols:
        row: dict[str, Any] = {"date": c.strftime("%Y-%m-%d") if hasattr(c, "strftime") else str(c)}
        for key in row_keys:
            if key in df.index:
                v = df.at[key, c]
                row[key] = float(v) if pd.notna(v) else None
            else:
                row[key] = None
        out.append(row)
    return out


_INCOME_ROWS = ["Total Revenue", "Gross Profit", "Operating Income", "Net Income", "EBITDA", "Basic EPS"]


def get_financials(symbol: str, exchange: str) -> dict:
    yf_sym = _resolve_yf(symbol, exchange)
    now = time()
    cached = _financials_cache.get(yf_sym)
    if cached and now - cached[1] < _FINANCIALS_TTL:
        return cached[0]

    try:
        t = yf.Ticker(yf_sym)
        annual = t.financials  # DataFrame
        quarterly = t.quarterly_financials  # DataFrame
    except Exception as e:
        logger.warning("financials fetch failed for %s: %s", yf_sym, e)
        if cached:
            return cached[0]
        return {"symbol": yf_sym, "annual": [], "quarterly": [], "error": str(e)}

    out = {
        "symbol": yf_sym,
        "annual": _df_to_periods(annual, _INCOME_ROWS),
        "quarterly": _df_to_periods(quarterly, _INCOME_ROWS),
    }
    _financials_cache[yf_sym] = (out, now)
    return out
