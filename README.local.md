# trading-agents-claude

Fork of TauricResearch/TradingAgents with:

- Claude as the LLM (Opus 4.7 head trader, Sonnet 4.6 analysts)
- FastAPI backend + Next.js 16 dashboard with live agent debate streaming (SSE)
- Alpaca paper/live execution with bracket orders (entry + stop-loss + take-profit)
- Server-enforced risk gate: position cap, per-trade risk %, daily order cap, kill switch
- Manual approval gate for every order (configurable; default on)

## Status

Phases 1-6 scaffolded. Not yet run end-to-end with real keys.

## Quick start (dev)

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY and Alpaca PAPER keys

# terminal 1 — API
cd apps/api && uv pip install -e . && uv run uvicorn app.main:app --reload

# terminal 2 — Web
cd apps/web && npm install && npm run dev

# open http://localhost:3000
```

## Quick start (docker)

```bash
cp .env.example .env
docker compose up -d --build
# open http://localhost:3000
```

## Architecture

```
trading-agents-claude/
├── tradingagents/        # Forked package (LangGraph multi-agent debate, Claude swap)
├── cli/                  # Original Typer CLI (unchanged)
├── apps/
│   ├── api/              # FastAPI: /runs (SSE), /portfolio, /trades, /safety
│   └── web/              # Next.js 16: dashboard, run detail, portfolio, trades, settings
├── docker-compose.yml    # Multi-service deploy, ports bound to 127.0.0.1
└── .env.example
```

## Safety

- Default mode is PAPER. Live requires `ALPACA_LIVE=true` AND `ALPACA_MANUAL_APPROVAL=true` for first weeks.
- Risk gate is the **only** path to broker submission. See `apps/api/app/services/risk.py`.
- Kill switch: top-right of UI, or `POST /safety/kill`. Blocks all submissions until released.
- Compose binds to `127.0.0.1`. Do NOT expose to a LAN without auth in front.

## What's NOT done yet

- Auth (currently no login). Required before non-localhost deploy.
- Trade-update WebSocket from Alpaca → live fill events into UI.
- Daily P&L kill-switch trigger (limit defined in env, not yet wired to actual P&L tracking).
- Prompt caching on Claude calls (cost optimization).
- Paper-soak observability (decision/outcome dashboard, win rate, P&L attribution).
