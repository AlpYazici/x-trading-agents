from langchain_core.tools import tool
from typing import Annotated
from tradingagents.dataflows.interface import route_to_vendor

@tool
def get_news(
    ticker: Annotated[str, "Ticker symbol"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """
    Retrieve news data for a given ticker symbol.
    Uses the configured news_data vendor.
    Args:
        ticker (str): Ticker symbol
        start_date (str): Start date in yyyy-mm-dd format
        end_date (str): End date in yyyy-mm-dd format
    Returns:
        str: A formatted string containing news data
    """
    return route_to_vendor("get_news", ticker, start_date, end_date)

@tool
def get_global_news(
    curr_date: Annotated[str, "Current date in yyyy-mm-dd format"],
    look_back_days: Annotated[int, "Number of days to look back"] = 7,
    limit: Annotated[int, "Maximum number of articles to return"] = 5,
) -> str:
    """
    Retrieve global news data.
    Uses the configured news_data vendor.
    Args:
        curr_date (str): Current date in yyyy-mm-dd format
        look_back_days (int): Number of days to look back (default 7)
        limit (int): Maximum number of articles to return (default 5)
    Returns:
        str: A formatted string containing global news data
    """
    return route_to_vendor("get_global_news", curr_date, look_back_days, limit)

@tool
def get_insider_transactions(
    ticker: Annotated[str, "ticker symbol"],
) -> str:
    """
    Retrieve insider transaction information about a company.
    Uses the configured news_data vendor.
    Args:
        ticker (str): Ticker symbol of the company
    Returns:
        str: A report of insider transaction data
    """
    return route_to_vendor("get_insider_transactions", ticker)


@tool
def get_congress_trades(
    ticker: Annotated[str, "Ticker symbol (US stocks only — Congress trades are US-listed)"],
    days_back: Annotated[int, "Look back this many days from today (default 90)"] = 90,
) -> str:
    """
    Retrieve recent US Congress (House + Senate) stock trades for a ticker.

    Politicians are required to disclose stock trades within 30-45 days under
    the STOCK Act. Their net buying/selling can be a sentiment signal,
    especially for sectors with regulatory exposure (defense, pharma, tech).

    Only useful for US-listed stocks. Returns "no data" for international
    tickers (.IS, .L, .DE, etc).

    Args:
        ticker (str): US ticker symbol (NVDA, AAPL, etc)
        days_back (int): How many days to look back (default 90)
    Returns:
        str: Formatted summary of recent Congress trades — buys, sells,
             notable people (Pelosi, etc), and net dollar volume.
    """
    from tradingagents.dataflows.congress_trades import get_congress_trades_summary
    return get_congress_trades_summary(ticker, days_back=days_back)
