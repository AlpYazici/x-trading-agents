"""Claude Agent SDK wrapper used as the LangChain ChatAnthropic replacement.

Three call patterns this module supports:

- :func:`call_text` — single-shot free-text generation (replaces ``llm.invoke``)
- :func:`call_structured` — single-shot structured output validated against a Pydantic
  schema (replaces ``with_structured_output`` + ``invoke``)
- :func:`call_text_with_data` — convenience for analyst nodes: pre-fetched data is
  embedded in the prompt; no tool use at the LLM layer.

All calls go through the local ``claude`` CLI when ``ANTHROPIC_API_KEY`` is unset, so
they draw from the user's Max subscription instead of the pay-as-you-go API. The
``record_usage_from_sdk`` helper writes per-call cost rows to the same ``LlmCost`` table
the LangChain cost tracker uses.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _ensure_no_api_key() -> None:
    """Pop ANTHROPIC_API_KEY so the SDK falls back to local CLI auth (Max plan)."""
    if os.environ.pop("ANTHROPIC_API_KEY", None):
        logger.debug("popped ANTHROPIC_API_KEY so Agent SDK uses local claude CLI auth")


def _run_sync(coro):
    """Run an async coroutine from sync code.

    Uses a fresh event loop in the current thread if none exists; raises if we're
    already inside a running loop (shouldn't happen — LangGraph nodes are sync).
    """
    try:
        running = asyncio.get_event_loop()
        if running.is_running():
            raise RuntimeError(
                "call_sdk invoked from within a running event loop — wrap the caller "
                "in a thread or refactor to async."
            )
    except RuntimeError:
        # No event loop in current thread — make one.
        pass

    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


async def _query_once(
    prompt: str,
    model: str,
    system_prompt: Optional[str],
    json_schema: Optional[dict],
):
    """Single-shot query with structured-or-text output. Returns the ResultMessage."""
    from claude_agent_sdk import (
        ClaudeAgentOptions,
        ResultMessage,
        query,
    )

    opts_kwargs: dict[str, Any] = {
        "model": model,
        "allowed_tools": [],
        "permission_mode": "bypassPermissions",
        "setting_sources": [],
    }
    if system_prompt:
        opts_kwargs["system_prompt"] = system_prompt
    if json_schema:
        opts_kwargs["output_format"] = {"type": "json_schema", "schema": json_schema}

    options = ClaudeAgentOptions(**opts_kwargs)

    result: Optional[ResultMessage] = None
    async for msg in query(prompt=prompt, options=options):
        if isinstance(msg, ResultMessage):
            result = msg
            break

    if result is None:
        raise RuntimeError("Agent SDK returned no ResultMessage")
    return result


def record_usage_from_sdk(result_msg: Any, run_id: Optional[int] = None) -> float:
    """Write each model's usage to the LlmCost table. Returns total USD cost.

    The SDK reports per-model usage in ``result_msg.model_usage`` (a dict keyed by model
    id). We write one row per model so the per-model rollup in /costs stays meaningful.
    """
    # ``record_usage`` lives in the API process. Try both common module paths
    # so this works whether we're running under the FastAPI app (``app.services...``
    # since the API is launched from ``apps/api/``) or from a project-root
    # script (``apps.api.app.services...``).
    record_usage = None
    for mod_path in ("app.services.cost_tracking", "apps.api.app.services.cost_tracking"):
        try:
            mod = __import__(mod_path, fromlist=["record_usage"])
            record_usage = mod.record_usage
            break
        except Exception:
            continue
    if record_usage is None:
        logger.warning("cost_tracking import failed; skipping usage record")
        return float(result_msg.total_cost_usd or 0.0)

    total = 0.0
    model_usage = getattr(result_msg, "model_usage", None) or {}
    for model_id, u in model_usage.items():
        # Normalise model id — SDK sometimes returns versioned ids like
        # "claude-haiku-4-5-20251001"; strip the date suffix for pricing lookup.
        canonical = model_id
        for prefix in ("claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5",
                       "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"):
            if model_id.startswith(prefix):
                canonical = prefix
                break
        cost = record_usage(
            run_id=run_id,
            model=canonical,
            input_tokens=int(u.get("inputTokens", 0)),
            output_tokens=int(u.get("outputTokens", 0)),
            cache_read_tokens=int(u.get("cacheReadInputTokens", 0)),
            cache_creation_tokens=int(u.get("cacheCreationInputTokens", 0)),
        )
        total += cost
    return total


# ---------------------------------------------------------------------------
# Public synchronous API
# ---------------------------------------------------------------------------


def call_text(
    prompt: str,
    model: str,
    system_prompt: Optional[str] = None,
    run_id: Optional[int] = None,
) -> str:
    """Run a single free-text generation. Returns the response text.

    Drop-in replacement for ``llm.invoke(prompt).content`` in free-text nodes
    (bull/bear researchers, risk debaters, reflection).
    """
    _ensure_no_api_key()
    result_msg = _run_sync(_query_once(prompt, model, system_prompt, None))
    record_usage_from_sdk(result_msg, run_id=run_id)
    return result_msg.result or ""


def call_structured(
    prompt: str,
    schema: type[T],
    model: str,
    system_prompt: Optional[str] = None,
    run_id: Optional[int] = None,
) -> tuple[T, Any]:
    """Run a single structured-output call. Returns ``(parsed_model, result_msg)``.

    Drop-in replacement for ``structured_llm.invoke(prompt)`` in nodes that wrap with
    ``with_structured_output``: Trader, Research Manager, Portfolio Manager.
    """
    _ensure_no_api_key()
    json_schema = schema.model_json_schema()
    result_msg = _run_sync(_query_once(prompt, model, system_prompt, json_schema))
    record_usage_from_sdk(result_msg, run_id=run_id)

    if result_msg.subtype != "success" or not result_msg.structured_output:
        raise RuntimeError(
            f"Agent SDK structured call failed: subtype={result_msg.subtype}, "
            f"result={result_msg.result!r}"
        )
    parsed = schema.model_validate(result_msg.structured_output)
    return parsed, result_msg


def call_text_with_data(
    system_prompt: str,
    user_prompt: str,
    model: str,
    run_id: Optional[int] = None,
) -> str:
    """Free-text generation with a separate system_prompt and user prompt.

    Used by analyst nodes that pre-fetch data with Python (rather than letting the
    LLM call tools) and embed the pre-fetched data in the user prompt.
    """
    return call_text(
        prompt=user_prompt,
        model=model,
        system_prompt=system_prompt,
        run_id=run_id,
    )


# ---------------------------------------------------------------------------
# Lightweight handle passed into node factories in place of ChatAnthropic
# ---------------------------------------------------------------------------


class _SdkResponse:
    """Minimal stand-in for langchain's AIMessage; exposes a ``.content`` string."""

    def __init__(self, content: str):
        self.content = content


class SdkLlm:
    """Per-node handle: routes ``invoke`` / ``invoke_structured`` to the Agent SDK.

    Constructed by ``trading_graph.TradingAgentsGraph.__init__`` and passed into
    each agent factory (``create_bull_researcher``, ``create_trader``, ...). The
    factories use it exactly like a ChatAnthropic object, so the node bodies stay
    nearly untouched.
    """

    def __init__(self, model: str, role: str = "llm"):
        self.model = model
        self.role = role
        # ``run_id`` is set per-execution by ``trading_graph.propagate`` so each
        # LLM call's cost row is attached to the right run. ``None`` means
        # "don't write to the LlmCost table" (used for ad-hoc invocations).
        self.run_id: Optional[int] = None

    def with_run_id(self, run_id: Optional[int]) -> "SdkLlm":
        """Return a fresh handle pointing at the same model but for a specific run."""
        clone = SdkLlm(self.model, self.role)
        clone.run_id = run_id
        return clone

    # ---- LangChain-shaped interface ----
    def invoke(self, prompt) -> _SdkResponse:
        """Accept either a plain string or a list of (role, content) tuples
        (LangChain's chat-history shape, e.g. ``[("system", "..."), ("human", "...")]``).
        Tuples are flattened into a single text prompt with the system part
        forwarded as ``system_prompt``.
        """
        system_prompt: Optional[str] = None
        user_text: str
        if isinstance(prompt, str):
            user_text = prompt
        elif isinstance(prompt, list):
            user_parts: list[str] = []
            for entry in prompt:
                if isinstance(entry, tuple) and len(entry) == 2:
                    role, content = entry
                    if role == "system":
                        system_prompt = (system_prompt + "\n\n" + content) if system_prompt else content
                    else:
                        user_parts.append(str(content))
                elif hasattr(entry, "content"):
                    role = getattr(entry, "type", "user")
                    if role == "system":
                        system_prompt = (system_prompt + "\n\n" + entry.content) if system_prompt else entry.content
                    else:
                        user_parts.append(entry.content)
                else:
                    user_parts.append(str(entry))
            user_text = "\n\n".join(user_parts) if user_parts else ""
        else:
            user_text = str(prompt)

        text = call_text(user_text, self.model, system_prompt=system_prompt, run_id=self.run_id)
        return _SdkResponse(text)

    def invoke_structured(self, prompt: str, schema: type[T]) -> T:
        parsed, _ = call_structured(prompt, schema, self.model, run_id=self.run_id)
        return parsed

    def invoke_with_system(self, system_prompt: str, user_prompt: str) -> str:
        """Free-text call with a distinct system prompt. Returns text directly."""
        return call_text(
            user_prompt,
            self.model,
            system_prompt=system_prompt,
            run_id=self.run_id,
        )

    # ---- compatibility with existing structured.py path ----
    def with_structured_output(self, schema: type[T]) -> "_StructuredLlmAdapter":
        return _StructuredLlmAdapter(self, schema)


class _StructuredLlmAdapter:
    """Drop-in replacement for ``llm.with_structured_output(schema)`` result.

    The LangChain version exposes an ``.invoke(prompt) -> BaseModel`` method;
    this adapter does the same thing but routes through the Agent SDK.
    """

    def __init__(self, sdk_llm: SdkLlm, schema: type[T]):
        self._sdk = sdk_llm
        self._schema = schema

    def invoke(self, prompt: Any) -> Any:
        # ``prompt`` may be a list of message dicts (the structured.py helper passes
        # those for the Trader / Portfolio Manager). Convert to a single text prompt
        # the SDK accepts.
        text_prompt = _coerce_to_text(prompt)
        return self._sdk.invoke_structured(text_prompt, self._schema)


def _coerce_to_text(prompt: Any) -> str:
    """Flatten a LangChain-style messages list into a single text prompt."""
    if isinstance(prompt, str):
        return prompt
    if isinstance(prompt, list):
        parts: list[str] = []
        for msg in prompt:
            if isinstance(msg, dict):
                role = msg.get("role", "user").upper()
                content = msg.get("content", "")
                parts.append(f"[{role}]\n{content}")
            elif hasattr(msg, "content"):
                role = getattr(msg, "type", getattr(msg, "role", "user")).upper()
                parts.append(f"[{role}]\n{msg.content}")
            else:
                parts.append(str(msg))
        return "\n\n".join(parts)
    return str(prompt)
