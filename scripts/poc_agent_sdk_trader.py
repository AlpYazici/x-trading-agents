"""PoC: port the Trader node from LangChain ChatAnthropic to Claude Agent SDK.

This script reproduces what tradingagents/agents/trader/trader.py does — takes
an investment_plan string, asks Claude for a structured TraderProposal, and
prints the rendered markdown plus cost/usage info.

Run with the project venv:
    .venv/bin/python scripts/poc_agent_sdk_trader.py

Requires ANTHROPIC_API_KEY env var (loaded from apps/api/.env if present).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

# Explicitly UNSET ANTHROPIC_API_KEY so the SDK falls back to the local
# `claude` CLI's stored credentials (the user's Max subscription).
# Per Anthropic's docs the Python SDK spawns the local Claude Code binary
# as a subprocess; when no API key is in the environment, that binary
# authenticates with whatever `claude login` stored.
os.environ.pop("ANTHROPIC_API_KEY", None)

from claude_agent_sdk import (  # noqa: E402
    ClaudeAgentOptions,
    ResultMessage,
    query,
)

# Reuse the existing TraderProposal schema so the PoC output is drop-in
# compatible with the rest of the pipeline.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tradingagents.agents.schemas import TraderProposal, render_trader_proposal  # noqa: E402


SAMPLE_INVESTMENT_PLAN = """
Bull thesis dominates. NVDA's data-center momentum continues with hyperscaler
capex commitments through 2027. Q4 guidance was reaffirmed at the GTC keynote
and supply constraints are easing as TSMC ramps CoWoS capacity. Technical
picture: price holding 50-EMA at $192, RSI 58, MACD bullish crossover last
week. Risks: regulatory exposure on China sales, broader macro headwinds, and
the stock has run up 25% YTD limiting near-term upside.

Recommended action: BUY on confirmed breakout above $200 with stop at $185.
Position sizing: 5% of portfolio. Take partial profits at $230 (12%) and let
remainder run to $260 target.
""".strip()

SAMPLE_TICKER = "NVDA"
SAMPLE_INSTRUMENT_CONTEXT = "NVDA is the US equity ticker for NVIDIA Corporation (Nasdaq)."


def build_prompt() -> str:
    """Build the user-facing prompt — same content as the LangChain trader node."""
    return (
        f"You are a trading agent analyzing market data to make investment decisions. "
        f"Based on your analysis, provide a specific recommendation to buy, sell, or hold. "
        f"Anchor your reasoning in the analysts' reports and the research plan.\n\n"
        f"Based on a comprehensive analysis by a team of analysts, here is an investment "
        f"plan tailored for {SAMPLE_TICKER}. {SAMPLE_INSTRUMENT_CONTEXT} This plan incorporates "
        f"insights from current technical market trends, macroeconomic indicators, and "
        f"social media sentiment. Use this plan as a foundation for evaluating your next "
        f"trading decision.\n\nProposed Investment Plan: {SAMPLE_INVESTMENT_PLAN}\n\n"
        f"Leverage these insights to make an informed and strategic decision."
    )


async def run_poc() -> None:
    prompt = build_prompt()
    schema = TraderProposal.model_json_schema()

    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        output_format={"type": "json_schema", "schema": schema},
        allowed_tools=[],          # single-shot, no tools
        permission_mode="bypassPermissions",
        setting_sources=[],        # don't load any local CLAUDE.md / skills
    )

    print(f"PoC: Agent SDK trader port (model=claude-sonnet-4-6)")
    print(f"Prompt length: {len(prompt)} chars, schema keys: {list(schema.get('properties', {}).keys())}")
    print("-" * 70)

    structured: dict | None = None
    result_msg: ResultMessage | None = None

    async for msg in query(prompt=prompt, options=options):
        if isinstance(msg, ResultMessage):
            result_msg = msg
            if msg.subtype == "success" and msg.structured_output:
                structured = msg.structured_output
            break

    if structured is None:
        print("FAILED — no structured output returned.")
        print(f"  subtype: {result_msg.subtype if result_msg else 'n/a'}")
        print(f"  result:  {result_msg.result if result_msg else 'n/a'}")
        return

    proposal = TraderProposal.model_validate(structured)
    rendered = render_trader_proposal(proposal)

    print("STRUCTURED OUTPUT:")
    print(json.dumps(structured, indent=2))
    print()
    print("RENDERED MARKDOWN:")
    print(rendered)
    print()
    print("=" * 70)
    print("COST / USAGE")
    print("=" * 70)
    print(f"  total_cost_usd:   ${result_msg.total_cost_usd or 0:.6f}")
    print(f"  duration_ms:      {result_msg.duration_ms}")
    print(f"  duration_api_ms:  {result_msg.duration_api_ms}")
    print(f"  num_turns:        {result_msg.num_turns}")
    print(f"  stop_reason:      {result_msg.stop_reason}")
    print(f"  usage:            {result_msg.usage}")
    if result_msg.model_usage:
        print(f"  model_usage:")
        for model, u in result_msg.model_usage.items():
            print(f"    {model}: {u}")


if __name__ == "__main__":
    asyncio.run(run_poc())
