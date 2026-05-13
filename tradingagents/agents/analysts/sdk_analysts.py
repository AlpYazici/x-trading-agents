"""Single-shot analyst nodes that pre-fetch tool data in Python before the LLM call.

The original analyst factories (``market_analyst``, ``news_analyst``,
``fundamentals_analyst``, ``social_media_analyst``) used LangChain's ``bind_tools``
+ multi-turn tool-call loop. That model doesn't fit the Claude Agent SDK's
session-based ``query()`` API and burns extra tokens on each tool round-trip.

These replacements fetch all relevant data with direct Python calls to the
underlying vendor functions (the same code the ``@tool`` wrappers delegate to),
embed it in the user prompt, then make a single SDK call. The output schema
matches the originals so ``setup.py`` wiring is unchanged.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from langchain_core.messages import AIMessage

from tradingagents.agents.utils.agent_utils import (
    build_instrument_context,
    get_language_instruction,
)
from tradingagents.dataflows.interface import route_to_vendor

logger = logging.getLogger(__name__)


# All technical indicators we pre-fetch for the market analyst. The LLM no
# longer chooses which subset to use — it gets the full picture and decides
# which signals to weight in its report.
_DEFAULT_INDICATORS = [
    "close_50_sma", "close_200_sma", "close_10_ema",
    "macd", "macds", "macdh",
    "rsi",
    "boll", "boll_ub", "boll_lb", "atr",
    "vwma",
]


def _window(end_date: str, days: int = 30) -> tuple[str, str]:
    """Return (start, end) ISO dates for a look-back window ending at end_date."""
    end = datetime.strptime(end_date, "%Y-%m-%d")
    start = end - timedelta(days=days)
    return start.strftime("%Y-%m-%d"), end_date


def _safe(label: str, fn, *args, **kwargs) -> str:
    """Call a vendor function; on error, return a labelled placeholder rather than raising."""
    try:
        out = fn(*args, **kwargs)
        if out is None or (isinstance(out, str) and not out.strip()):
            return f"[{label}: no data]"
        return str(out)
    except Exception as exc:  # noqa: BLE001
        logger.warning("pre-fetch failed for %s: %s", label, exc)
        return f"[{label}: error — {exc}]"


# ---------------------------------------------------------------------------
# Market analyst — price + technical indicators
# ---------------------------------------------------------------------------


def create_market_analyst(llm):
    def market_analyst_node(state):
        ticker = state["company_of_interest"]
        current_date = state["trade_date"]
        instrument_context = build_instrument_context(ticker)
        start, end = _window(current_date, days=60)

        stock_data = _safe(
            "stock_data",
            route_to_vendor, "get_stock_data", ticker, start, end,
        )
        # Fetch each indicator individually — `route_to_vendor("get_indicators", ...)`
        # routes to ``get_stock_stats_indicators_window(symbol, indicator, curr_date,
        # look_back_days)`` which expects a single indicator name per call.
        indicator_blocks: list[str] = []
        for ind in _DEFAULT_INDICATORS:
            block = _safe(
                f"indicator:{ind}",
                route_to_vendor, "get_indicators", ticker, ind, current_date, 30,
            )
            indicator_blocks.append(f"### {ind}\n{block}")
        indicators_text = "\n\n".join(indicator_blocks)

        system_prompt = (
            "You are a trading-side market analyst. Read the technical indicators "
            "and recent price action, then write a detailed but tightly-reasoned "
            "report. Highlight regime (trend/range), momentum, volatility, and "
            "volume signals. Identify two to four indicators that are most "
            "informative for the current setup and explain WHY — do not list "
            "every indicator. End with a Markdown summary table of key levels "
            "and signals." + get_language_instruction()
        )

        user_prompt = (
            f"Ticker: {ticker}\n{instrument_context}\n"
            f"As-of date: {current_date}\n\n"
            f"## Recent price history (60-day window)\n{stock_data}\n\n"
            f"## Technical indicators (as of {current_date})\n{indicators_text}\n"
        )

        report = llm.invoke_with_system(system_prompt, user_prompt)
        return {
            "messages": [AIMessage(content=report)],
            "market_report": report,
        }

    return market_analyst_node


# ---------------------------------------------------------------------------
# News analyst — company news + global news + congress trades
# ---------------------------------------------------------------------------


def create_news_analyst(llm):
    def news_analyst_node(state):
        ticker = state["company_of_interest"]
        current_date = state["trade_date"]
        instrument_context = build_instrument_context(ticker)
        start, end = _window(current_date, days=7)

        company_news = _safe(
            "company_news",
            route_to_vendor, "get_news", ticker, start, end,
        )
        global_news = _safe(
            "global_news",
            route_to_vendor, "get_global_news", current_date, 7, 5,
        )

        # Congress trades only for US tickers — quick sentinel check.
        congress = ""
        if not any(c in ticker for c in ".-=^"):
            try:
                from tradingagents.dataflows.capitol_trades_scraper import (
                    get_capitol_trades_summary,
                )
                congress = get_capitol_trades_summary(ticker) or "[no recent Congress trades]"
            except Exception:
                try:
                    from tradingagents.dataflows.congress_trades import (
                        get_congress_trades_summary,
                    )
                    congress = get_congress_trades_summary(ticker, days_back=90)
                except Exception as exc:  # noqa: BLE001
                    congress = f"[congress trades unavailable: {exc}]"

        system_prompt = (
            "You are a news researcher writing a trader-focused weekly recap. "
            "Synthesize company news, macro headlines, and US Congress trading "
            "(when relevant). Be specific — name the catalysts, dates, and "
            "directional implications. Skip filler. End with a Markdown table "
            "of the 5-7 most market-moving items."
            + get_language_instruction()
        )

        user_prompt = (
            f"Ticker: {ticker}\n{instrument_context}\n"
            f"As-of date: {current_date} (look-back: 7 days)\n\n"
            f"## Company news\n{company_news}\n\n"
            f"## Global / macro news\n{global_news}\n\n"
            f"## US Congress trades (last 90 days, if applicable)\n{congress}\n"
        )

        report = llm.invoke_with_system(system_prompt, user_prompt)
        return {
            "messages": [AIMessage(content=report)],
            "news_report": report,
        }

    return news_analyst_node


# ---------------------------------------------------------------------------
# Fundamentals analyst — financial statements + ratios
# ---------------------------------------------------------------------------


def create_fundamentals_analyst(llm):
    def fundamentals_analyst_node(state):
        ticker = state["company_of_interest"]
        current_date = state["trade_date"]
        instrument_context = build_instrument_context(ticker)

        fundamentals = _safe("fundamentals", route_to_vendor, "get_fundamentals", ticker)
        balance = _safe("balance_sheet", route_to_vendor, "get_balance_sheet", ticker)
        cashflow = _safe("cashflow", route_to_vendor, "get_cashflow", ticker)
        income = _safe("income_statement", route_to_vendor, "get_income_statement", ticker)

        system_prompt = (
            "You are a fundamentals analyst. Read the financial snapshot and "
            "statements, then produce a comprehensive report covering valuation, "
            "profitability, balance-sheet strength, cash conversion, and growth "
            "trajectory. Cite specific numbers. Compare against rough industry "
            "norms when you can. End with a Markdown table of key ratios and "
            "their signal (bullish / neutral / bearish)."
            + get_language_instruction()
        )

        user_prompt = (
            f"Ticker: {ticker}\n{instrument_context}\n"
            f"As-of date: {current_date}\n\n"
            f"## Fundamentals snapshot\n{fundamentals}\n\n"
            f"## Balance sheet\n{balance}\n\n"
            f"## Cash flow\n{cashflow}\n\n"
            f"## Income statement\n{income}\n"
        )

        report = llm.invoke_with_system(system_prompt, user_prompt)
        return {
            "messages": [AIMessage(content=report)],
            "fundamentals_report": report,
        }

    return fundamentals_analyst_node


# ---------------------------------------------------------------------------
# Social-media analyst — company news + sentiment-leaning narrative
# ---------------------------------------------------------------------------


def create_social_media_analyst(llm):
    def social_media_analyst_node(state):
        ticker = state["company_of_interest"]
        current_date = state["trade_date"]
        instrument_context = build_instrument_context(ticker)
        start, end = _window(current_date, days=7)

        company_news = _safe(
            "company_news",
            route_to_vendor, "get_news", ticker, start, end,
        )

        system_prompt = (
            "You are a social-media and sentiment analyst. The news feed below "
            "is your raw signal — read between the lines for tone, retail vs "
            "institutional framing, hype cycles, FUD, and inflection points. "
            "Be honest about confidence levels. End with a Markdown table "
            "scoring overall sentiment (positive/neutral/negative) on price, "
            "volume, narrative, and risk."
            + get_language_instruction()
        )

        user_prompt = (
            f"Ticker: {ticker}\n{instrument_context}\n"
            f"As-of date: {current_date} (look-back: 7 days)\n\n"
            f"## News and social-media signal\n{company_news}\n"
        )

        report = llm.invoke_with_system(system_prompt, user_prompt)
        return {
            "messages": [AIMessage(content=report)],
            "sentiment_report": report,
        }

    return social_media_analyst_node
