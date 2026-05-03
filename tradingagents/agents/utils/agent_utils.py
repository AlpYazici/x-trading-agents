from langchain_core.messages import HumanMessage, RemoveMessage

# Import tools from separate utility files
from tradingagents.agents.utils.core_stock_tools import (
    get_stock_data
)
from tradingagents.agents.utils.technical_indicators_tools import (
    get_indicators
)
from tradingagents.agents.utils.fundamental_data_tools import (
    get_fundamentals,
    get_balance_sheet,
    get_cashflow,
    get_income_statement
)
from tradingagents.agents.utils.news_data_tools import (
    get_news,
    get_insider_transactions,
    get_global_news,
    get_congress_trades,
)


def get_language_instruction() -> str:
    """Return a prompt instruction for the configured output language.

    Returns empty string when English (default), so no extra tokens are used.
    Only applied to user-facing agents (analysts, portfolio manager).
    Internal debate agents stay in English for reasoning quality.
    """
    from tradingagents.dataflows.config import get_config
    lang = get_config().get("output_language", "English")
    if lang.strip().lower() == "english":
        return ""
    return f" Write your entire response in {lang}."


_company_info_cache: dict[str, str] = {}


def _company_info_block(ticker: str) -> str:
    """Fetch + format yfinance .info for the ticker. Cached per process."""
    if ticker in _company_info_cache:
        return _company_info_cache[ticker]
    try:
        from tradingagents.dataflows.y_finance import _resolve_symbol
        import yfinance as yf
        resolved = _resolve_symbol(ticker)
        info = yf.Ticker(resolved).info or {}
    except Exception:
        info = {}
        resolved = ticker

    name = info.get("longName") or info.get("shortName")
    sector = info.get("sector")
    industry = info.get("industry")
    country = info.get("country")
    summary = (info.get("longBusinessSummary") or "")[:600]
    currency = info.get("currency")
    exchange = info.get("exchange") or info.get("fullExchangeName")

    if not name:
        block = ""
    else:
        parts = [f"\n\nCompany: **{name}**"]
        meta = []
        if sector: meta.append(f"sector={sector}")
        if industry: meta.append(f"industry={industry}")
        if country: meta.append(f"country={country}")
        if exchange: meta.append(f"exchange={exchange}")
        if currency: meta.append(f"currency={currency}")
        if meta: parts.append(f"({', '.join(meta)})")
        if resolved != ticker.upper():
            parts.append(f"yfinance symbol: `{resolved}`")
        if summary:
            parts.append(f"\nBusiness summary: {summary}")
        block = " ".join(parts)
    _company_info_cache[ticker] = block
    return block


def build_instrument_context(ticker: str) -> str:
    """Describe the exact instrument + company so agents have full context.

    Critical for non-US tickers (BIST, LSE, etc) where Claude won't recognize
    the bare symbol. e.g. `RYGYO` is meaningless — the agent needs to know
    it's Reysas Gayrimenkul Yatirim Ortakligi A.S., a Turkish industrial REIT.
    """
    base = (
        f"The instrument to analyze is `{ticker}`. "
        "Use this exact ticker in every tool call, report, and recommendation, "
        "preserving any exchange suffix (e.g. `.TO`, `.L`, `.HK`, `.T`, `.IS`)."
    )
    return base + _company_info_block(ticker)

def create_msg_delete():
    def delete_messages(state):
        """Clear messages and add placeholder for Anthropic compatibility"""
        messages = state["messages"]

        # Remove all messages
        removal_operations = [RemoveMessage(id=m.id) for m in messages]

        # Add a minimal placeholder message
        placeholder = HumanMessage(content="Continue")

        return {"messages": removal_operations + [placeholder]}

    return delete_messages


        
