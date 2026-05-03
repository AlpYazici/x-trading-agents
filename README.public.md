# x-trading-agents

> Multi-agent AI trading dashboard powered by Claude.
> Fork of [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — adds a FastAPI service, Next.js 16 dashboard, Alpaca paper/live execution, server-side risk gate, scheduled scans, BIST + crypto support, and US Congress trade scraping.

## What you get

- **Claude as the LLM head**: Opus 4.7 deep / Sonnet 4.6 quick (configurable)
- **Multi-agent debate**: Market analyst → Social → News → Fundamentals → Bull vs Bear → Trader → Risk team → final BUY/SELL/HOLD
- **Real broker integration**: Alpaca paper + live (paper-only by default). Bracket orders with stop-loss + take-profit at submission time.
- **Risk gate**: server-enforced. Position cap %, daily loss auto-kill, per-trade risk sizing, manual approval gate, kill switch.
- **Live agent debate via SSE**: watch Claude argue with itself in real-time on the dashboard.
- **Manual portfolio**: track holdings across US stocks, BIST (Borsa İstanbul), and crypto. Multi-currency aware (TRY/USD FX).
- **TradingView Lightweight Charts**: candle/area charts, 6 timeframes (1H–1Y).
- **News + earnings + Congress trades**: agent sees real-time news and politicians' stock disclosures (capitoltrades.com via Scrapling).
- **Cost tracking**: per-LLM-call token + dollar tracking.
- **Scheduled scans**: cron-driven daily watchlist analysis.
- **Reflection / memory**: agent learns from past decisions; win-rate dashboard.

## Quick start (local dev)

Prerequisites: Python 3.13+, Node 22+, [uv](https://docs.astral.sh/uv/), an [Anthropic API key](https://console.anthropic.com), [Alpaca paper trading keys](https://alpaca.markets) (free).

```bash
git clone https://github.com/AlpYazici/x-trading-agents.git
cd x-trading-agents

# Configure secrets — copy + fill
cp .env.example apps/api/.env
$EDITOR apps/api/.env
# Set: ANTHROPIC_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY
# Leave: ALPACA_LIVE=false (paper mode default — safe)

# Install API
cd apps/api && uv sync && cd ../..

# Install web
cd apps/web && npm install && cd ../..

# Run (two terminals)
# API → http://localhost:8000
cd apps/api && uv run uvicorn app.main:app --reload --port 8000
# Web → http://localhost:3000
cd apps/web && npm run dev
```

Then open `http://localhost:3000`. **You start with empty portfolio + watchlist defaults.** Add holdings via the Portfolio page; type tickers on Dashboard to run agent debates.

## Production deploy (Cloudflare Tunnel + Access)

This repo runs my personal instance on a Mac mini behind Cloudflare Tunnel + Access (email allowlist). For your own deploy:

1. Run the dev setup above on your server / Mac
2. Use `launchd`, `systemd`, or `pm2` to keep API + web running as services
3. Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), create a tunnel, point your domain at it
4. Add a Cloudflare Access policy (Zero Trust) with email allowlist for security

Or use the included `docker-compose.yml`:

```bash
cp .env.example .env  # or apps/api/.env
docker compose up -d --build
```

## Safety — before you enable live trading

This is a **paper-first** project. Defaults you should NOT change without understanding:

| Env var | Default | What changing means |
|---|---|---|
| `ALPACA_LIVE` | `false` | `true` = real money on Alpaca. Do NOT flip without paper-soak first. |
| `ALPACA_MANUAL_APPROVAL` | `true` | Every order needs a human click in the UI. `false` = auto-submit (risky). |
| `RISK_DAILY_LOSS_LIMIT_PCT` | `0.03` | If portfolio drops 3% in a day, auto-engage kill switch. |
| `RISK_MAX_POSITION_PCT` | `0.10` | Max 10% of equity per position. |
| `RUN_RATE_LIMIT_PER_DAY` | `50` | Max LLM debates per 24h (cost cap). |

**LLM hallucinations + real money is a bad combination.** The risk gate is the only thing between an agent typo and your account. Read `apps/api/app/services/risk.py` before live mode.

## Pages (sidebar nav)

| Page | What |
|---|---|
| Dashboard | Markets overview (stocks/crypto/indices/FX/commodities), watchlist, news, earnings, agent run form |
| Agentic | Watchlist with agent run buttons, live chart |
| Runs | All historical agent debates |
| Daily picks | Latest scheduled scan results — auto-suggestions |
| Reflection | Agent decision history + win rate (TradingAgents memory) |
| Portfolio | Manual holdings (multi-currency), time-series chart, P/L pie/bars, TradingView per-ticker |
| Trades | Pending + submitted orders, manual order form |
| Closed | Closed positions + CSV export (taxes) |
| Schedules | Cron-driven batch scans |
| Settings | Risk limits, mode (paper/live), kill switch |

## Stack

- **Backend**: FastAPI, SQLModel + SQLite, LangGraph, langchain-anthropic, alpaca-py, yfinance, APScheduler, Scrapling (Capitol Trades scraper), Playwright (transitive)
- **Frontend**: Next.js 16 (App Router), shadcn/ui, Tailwind v4, TanStack Query, Recharts, lightweight-charts, lucide-react
- **LLM**: Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5 (configurable)
- **Broker**: Alpaca (paper + live), bracket orders only
- **Auth (deploy)**: Cloudflare Access (email/Google OAuth allowlist)

## License

Apache 2.0 (inherited from upstream TauricResearch/TradingAgents).

## Credits

- [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — the multi-agent core
- [shadcn/ui](https://ui.shadcn.com), [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/), [Scrapling](https://github.com/D4Vinci/Scrapling)

## Disclaimer

Not financial advice. LLMs hallucinate. Don't risk money you can't lose. Author not responsible for trading losses.
