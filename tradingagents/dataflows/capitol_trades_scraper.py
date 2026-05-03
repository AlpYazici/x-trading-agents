"""Scrape capitoltrades.com via headless Chromium.

Their REST backend (bff.capitoltrades.com) is CloudFront-WAF-blocked for
non-browser clients, but a real browser session breezes through.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from time import time

logger = logging.getLogger(__name__)

# In-process per-ticker cache (24h TTL)
_cache: dict[str, tuple[list[dict], float]] = {}
_cache_lock = threading.Lock()
_TTL = 6 * 3600  # 6 hours


def get_capitol_trades(ticker: str, max_rows: int = 30) -> list[dict]:
    """Return list of recent congress trades for `ticker`.

    Each item: {date, person, party, chamber, side, amount, asset_url}
    Returns [] on failure.
    """
    sym = ticker.upper().strip()
    with _cache_lock:
        cached = _cache.get(sym)
        if cached and time() - cached[1] < _TTL:
            return cached[0]

    try:
        rows = asyncio.run(_scrape_async(sym, max_rows))
    except Exception as e:
        logger.warning("capitoltrades scrape failed for %s: %s", sym, e)
        rows = []

    with _cache_lock:
        _cache[sym] = (rows, time())
    return rows


async def _scrape_async(ticker: str, max_rows: int) -> list[dict]:
    from playwright.async_api import async_playwright

    url = f"https://www.capitoltrades.com/trades?assets={ticker}&pageSize={max_rows}"
    rows: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 900},
                locale="en-US",
            )
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30_000)
            # Wait for table rows to render
            try:
                await page.wait_for_selector("table tbody tr", timeout=10_000)
            except Exception:
                pass

            # Extract via DOM
            rows = await page.evaluate("""() => {
                const out = [];
                const trs = document.querySelectorAll('table tbody tr');
                for (const tr of trs) {
                    const cells = tr.querySelectorAll('td');
                    if (cells.length < 5) continue;
                    const txt = (i) => (cells[i]?.innerText || '').trim();
                    out.push({
                        person: txt(0).split('\\n')[0],
                        party_chamber: txt(0).split('\\n').slice(1).join(' ').trim(),
                        traded: txt(2),
                        published: txt(3),
                        side: txt(4),
                        size: txt(5),
                        price: txt(6),
                    });
                }
                return out;
            }""")
        finally:
            await browser.close()

    return rows or []


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
        "| Traded | Published | Person | Party/Chamber | Side | Size | Price |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows[:max_rows]:
        lines.append(
            f"| {r.get('traded','')} | {r.get('published','')} | {r.get('person','')} | "
            f"{r.get('party_chamber','')} | {r.get('side','')} | {r.get('size','')} | "
            f"{r.get('price','')} |"
        )

    if n_buy > n_sell * 2:
        lines.append("\n**Signal**: Predominantly buying — politicians may have positive view.")
    elif n_sell > n_buy * 2:
        lines.append("\n**Signal**: Predominantly selling — politicians may have negative view.")
    else:
        lines.append("\n**Signal**: Mixed — no strong directional bias.")

    return "\n".join(lines)
