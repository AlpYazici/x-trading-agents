"""Scrape capitoltrades.com via Scrapling (StealthyFetcher = Camoufox + anti-fingerprinting).

Bypasses CloudFront WAF that blocks vanilla curl/requests, with auto-adapting
selectors more resilient to layout changes than vanilla Playwright DOM queries.
"""
from __future__ import annotations

import logging
import threading
from time import time

logger = logging.getLogger(__name__)

# In-process per-ticker cache (6h TTL — disclosures update slowly)
_cache: dict[str, tuple[list[dict], float]] = {}
_cache_lock = threading.Lock()
_TTL = 6 * 3600


def get_capitol_trades(ticker: str, max_rows: int = 30) -> list[dict]:
    """Return list of recent congress trades for `ticker`. Empty on failure."""
    sym = ticker.upper().strip()
    with _cache_lock:
        cached = _cache.get(sym)
        if cached and time() - cached[1] < _TTL:
            return cached[0]

    try:
        rows = _scrape(sym, max_rows)
    except Exception as e:
        logger.warning("scrapling capitoltrades scrape failed for %s: %s", sym, e)
        rows = []

    with _cache_lock:
        _cache[sym] = (rows, time())
    return rows


def _scrape(ticker: str, max_rows: int) -> list[dict]:
    from scrapling.fetchers import StealthyFetcher

    url = f"https://www.capitoltrades.com/trades?assets={ticker}&pageSize={max_rows}"

    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        wait_selector="table tbody tr",
        wait_selector_state="visible",
        timeout=30_000,
    )

    rows: list[dict] = []
    # Auto-adapting selectors via Scrapling — survives minor layout changes
    for tr in page.css("table tbody tr"):
        cells = tr.css("td")
        if len(cells) < 7:
            continue

        def text(i: int) -> str:
            try:
                # Use get_all_text() to descend into nested divs/spans
                t = cells[i].get_all_text(strip=True, separator="|")
                # Cells with multi-line content (politician name + party/chamber)
                # come back as "Mark Warner|DemocratSenateVA" — keep separator
                return t or ""
            except Exception:
                return ""

        person_block = text(0)
        person_parts = [s.strip() for s in person_block.split("|") if s.strip()]
        person_name = person_parts[0] if person_parts else ""
        party_chamber = " ".join(person_parts[1:]) if len(person_parts) > 1 else ""

        # Column order on capitoltrades.com (10 cells per row):
        # 0=Politician  1=Traded Issuer  2=Published date  3=Traded date
        # 4=Filed (delay days)  5=Owner (self/joint/child)
        # 6=Side (buy/sell)  7=Size  8=Price  9=...
        rows.append({
            "person": person_name,
            "party_chamber": party_chamber,
            "issuer": text(1).replace("|", " "),
            "published": text(2).replace("|", " "),
            "traded": text(3).replace("|", " "),
            "filed_delay": text(4).replace("|", " "),
            "owner": text(5).replace("|", " "),
            "side": text(6).replace("|", " "),
            "size": text(7).replace("|", " "),
            "price": (text(8) if len(cells) > 8 else "").replace("|", " "),
        })

    return rows


def get_capitol_trades_summary(ticker: str, max_rows: int = 30) -> str:
    """Markdown summary for agent consumption."""
    sym = ticker.upper().strip()
    if any(c in sym for c in (".", "=", "-")):
        return f"No US Congress trade data for non-US ticker `{ticker}`."

    rows = get_capitol_trades(sym, max_rows=max_rows)
    if not rows:
        return f"No recent US Congress trades found for `{ticker}` on capitoltrades.com."

    n_buy = sum(1 for r in rows if "buy" in (r.get("side") or "").lower())
    n_sell = sum(1 for r in rows if "sell" in (r.get("side") or "").lower())

    lines = [
        f"## US Congress trades for `{ticker}` (capitoltrades.com)",
        "",
        f"**Total disclosed trades**: {len(rows)} (buys: {n_buy}, sells: {n_sell})",
        "",
        "| Traded | Person | Party/Chamber | Owner | Side | Size | Price |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows[:max_rows]:
        lines.append(
            f"| {r.get('traded','')} | {r.get('person','')} | "
            f"{r.get('party_chamber','')} | {r.get('owner','')} | {r.get('side','')} | "
            f"{r.get('size','')} | {r.get('price','')} |"
        )

    if n_buy > n_sell * 2:
        lines.append("\n**Signal**: Predominantly buying — politicians may have positive view.")
    elif n_sell > n_buy * 2:
        lines.append("\n**Signal**: Predominantly selling — politicians may have negative view.")
    else:
        lines.append("\n**Signal**: Mixed — no strong directional bias.")

    return "\n".join(lines)
