"""Anthropic token usage + cost estimation."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select, func
from langchain_core.callbacks import BaseCallbackHandler

from ..db import LlmCost, engine


# Anthropic pricing — USD per 1M tokens (May 2026 rates)
PRICING = {
    "claude-opus-4-7":   {"input": 15.0, "output": 75.0, "cache_read": 1.5,  "cache_write": 18.75},
    "claude-opus-4-6":   {"input": 15.0, "output": 75.0, "cache_read": 1.5,  "cache_write": 18.75},
    "claude-opus-4-5":   {"input": 15.0, "output": 75.0, "cache_read": 1.5,  "cache_write": 18.75},
    "claude-sonnet-4-6": {"input": 3.0,  "output": 15.0, "cache_read": 0.3,  "cache_write": 3.75},
    "claude-sonnet-4-5": {"input": 3.0,  "output": 15.0, "cache_read": 0.3,  "cache_write": 3.75},
    "claude-haiku-4-5":  {"input": 1.0,  "output": 5.0,  "cache_read": 0.1,  "cache_write": 1.25},
}


def _calc_cost(model: str, in_t: int, out_t: int, cr_t: int = 0, cw_t: int = 0) -> float:
    p = PRICING.get(model)
    if p is None:
        # Fallback — Sonnet rates
        p = PRICING["claude-sonnet-4-6"]
    return (
        (in_t * p["input"]
         + out_t * p["output"]
         + cr_t * p["cache_read"]
         + cw_t * p["cache_write"]) / 1_000_000
    )


def record_usage(
    run_id: Optional[int],
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> float:
    """Persist a single LLM call's usage to DB. Returns USD cost."""
    cost = _calc_cost(model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
    with Session(engine) as s:
        row = LlmCost(
            run_id=run_id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_creation_tokens=cache_creation_tokens,
            cost_usd=cost,
        )
        s.add(row)
        s.commit()
    return cost


def summary() -> dict:
    """Aggregate stats: today / 7d / 30d / all-time."""
    now = datetime.utcnow()
    with Session(engine) as s:
        all_rows = s.exec(select(LlmCost)).all()
        today_cut = datetime(now.year, now.month, now.day)
        d7_cut = now - timedelta(days=7)
        d30_cut = now - timedelta(days=30)

        def agg(rows):
            return {
                "calls": len(rows),
                "input_tokens": sum(r.input_tokens for r in rows),
                "output_tokens": sum(r.output_tokens for r in rows),
                "cache_read_tokens": sum(r.cache_read_tokens for r in rows),
                "cost_usd": sum(r.cost_usd for r in rows),
            }

        return {
            "today": agg([r for r in all_rows if r.ts >= today_cut]),
            "last_7d": agg([r for r in all_rows if r.ts >= d7_cut]),
            "last_30d": agg([r for r in all_rows if r.ts >= d30_cut]),
            "all_time": agg(all_rows),
            "by_model": _by_model(all_rows),
        }


def _by_model(rows: list[LlmCost]) -> list[dict]:
    by: dict[str, dict] = {}
    for r in rows:
        b = by.setdefault(r.model, {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0})
        b["calls"] += 1
        b["input_tokens"] += r.input_tokens
        b["output_tokens"] += r.output_tokens
        b["cost_usd"] += r.cost_usd
    return [{"model": m, **stats} for m, stats in by.items()]


def per_run() -> list[dict]:
    """Cost grouped by run_id."""
    with Session(engine) as s:
        rows = s.exec(select(LlmCost).where(LlmCost.run_id != None)).all()  # noqa: E711
        by: dict[int, dict] = {}
        for r in rows:
            b = by.setdefault(r.run_id, {  # type: ignore[arg-type]
                "run_id": r.run_id,
                "calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0.0,
            })
            b["calls"] += 1
            b["input_tokens"] += r.input_tokens
            b["output_tokens"] += r.output_tokens
            b["cost_usd"] += r.cost_usd
        return sorted(by.values(), key=lambda x: -x["run_id"])


class CostTrackingCallback(BaseCallbackHandler):
    """LangChain callback that records token usage per LLM call."""

    def __init__(self, run_id: Optional[int]) -> None:
        self.run_id = run_id

    def on_llm_end(self, response, **kw):  # noqa: ANN001
        try:
            # langchain_anthropic puts usage in response.llm_output["usage"]
            usage = (response.llm_output or {}).get("usage") if response.llm_output else None
            model = (response.llm_output or {}).get("model") if response.llm_output else None

            if not usage:
                # Try generation-level (some langchain versions)
                gen = response.generations[0][0] if response.generations else None
                if gen and hasattr(gen, "message"):
                    msg = gen.message
                    usage = getattr(msg, "usage_metadata", None) or getattr(msg, "response_metadata", {}).get("usage")

            if not usage:
                return

            in_t = usage.get("input_tokens") or usage.get("prompt_tokens") or 0
            out_t = usage.get("output_tokens") or usage.get("completion_tokens") or 0
            cr_t = usage.get("cache_read_input_tokens") or 0
            cw_t = usage.get("cache_creation_input_tokens") or 0

            record_usage(
                run_id=self.run_id,
                model=model or "claude-sonnet-4-6",
                input_tokens=in_t,
                output_tokens=out_t,
                cache_read_tokens=cr_t,
                cache_creation_tokens=cw_t,
            )
        except Exception:
            # Cost tracking is best-effort; never break the run.
            import logging
            logging.getLogger(__name__).debug("cost tracking failed", exc_info=True)
