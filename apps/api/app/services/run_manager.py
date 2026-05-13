"""In-process run manager.

Owns the asyncio Queues that fan out LangGraph node events to SSE
subscribers, runs the blocking TradingAgentsGraph in a thread, and
persists every event to SQLite for replay.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from langchain_core.callbacks import BaseCallbackHandler
from sqlmodel import Session

from ..config import settings
from ..db import Run, RunEvent, engine

logger = logging.getLogger(__name__)


@dataclass
class _RunHandle:
    run_id: int
    ticker: str
    trade_date: str
    queues: list[asyncio.Queue] = field(default_factory=list)
    done: bool = False
    final: Optional[dict[str, Any]] = None
    task: Optional[asyncio.Task] = None


class _Manager:
    def __init__(self) -> None:
        self._runs: dict[int, _RunHandle] = {}
        self._lock = asyncio.Lock()

    def get(self, run_id: int) -> Optional[_RunHandle]:
        return self._runs.get(run_id)

    async def start(self, ticker: str, trade_date: str) -> int:
        with Session(engine) as s:
            run = Run(ticker=ticker.upper(), trade_date=trade_date, status="running")
            s.add(run)
            s.commit()
            s.refresh(run)
            run_id = run.id  # type: ignore[assignment]

        handle = _RunHandle(run_id=run_id, ticker=ticker.upper(), trade_date=trade_date)
        self._runs[run_id] = handle

        loop = asyncio.get_running_loop()
        handle.task = loop.create_task(self._execute(handle))
        return run_id

    async def resume(self, run_id: int, ticker: str, trade_date: str) -> None:
        """Re-launch a worker for an existing 'running' DB row (post-restart).

        Relies on TradingAgents' LangGraph SqliteSaver checkpoint — the graph
        will skip nodes already completed and pick up where it left off.
        """
        if run_id in self._runs and not self._runs[run_id].done:
            return  # already running
        handle = _RunHandle(run_id=run_id, ticker=ticker.upper(), trade_date=trade_date)
        self._runs[run_id] = handle
        loop = asyncio.get_running_loop()
        handle.task = loop.create_task(self._execute(handle))

    async def subscribe(self, run_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=512)

        # Replay persisted events for any run that has them.
        with Session(engine) as s:
            run = s.get(Run, run_id)
            past = s.query(RunEvent).filter(RunEvent.run_id == run_id).order_by(RunEvent.id).all()  # type: ignore[arg-type]
            for ev in past:
                await q.put({"event": ev.event_type, "data": json.loads(ev.payload)})

        h = self._runs.get(run_id)

        # Run is finished (in DB) and not currently active in memory: emit terminal event.
        if h is None:
            if run is None:
                await q.put({"event": "error", "data": {"message": "unknown run"}})
            elif run.status in ("completed", "failed"):
                await q.put({
                    "event": "done",
                    "data": {
                        "status": run.status,
                        "signal": run.signal,
                        "decision": run.final_decision,
                        "error": run.error,
                    },
                })
            else:
                # Stale row: marked running but no worker (recovered as failed at startup).
                await q.put({"event": "error", "data": {"message": "run was orphaned (API restart)"}})
                await q.put({"event": "done", "data": {}})
            return q

        if h.done:
            await q.put({"event": "done", "data": h.final or {}})
            return q

        h.queues.append(q)
        return q

    async def _emit(self, h: _RunHandle, event_type: str, payload: dict[str, Any], node: str = "") -> None:
        with Session(engine) as s:
            s.add(RunEvent(run_id=h.run_id, node=node, event_type=event_type, payload=json.dumps(payload, default=str)))
            s.commit()
        msg = {"event": event_type, "data": payload}
        for q in list(h.queues):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                logger.warning("dropping event for slow subscriber on run %s", h.run_id)

    async def _execute(self, h: _RunHandle) -> None:
        loop = asyncio.get_running_loop()
        await self._emit(h, "run_started", {"run_id": h.run_id, "ticker": h.ticker, "trade_date": h.trade_date})

        try:
            from tradingagents.default_config import DEFAULT_CONFIG
            from tradingagents.graph.trading_graph import TradingAgentsGraph

            cfg = DEFAULT_CONFIG.copy()
            cfg["llm_provider"] = "anthropic"
            cfg["deep_think_llm"] = settings.deep_think_llm
            cfg["quick_think_llm"] = settings.quick_think_llm
            cfg["llm_backend"] = settings.llm_backend
            cfg["max_debate_rounds"] = settings.max_debate_rounds
            # Enable checkpointing so a run survives an API restart.
            # If the worker dies mid-run, the next /runs POST for the same
            # ticker+date resumes from the last completed LangGraph node.
            cfg["checkpoint_enabled"] = True

            callback = _StreamingCallback(h, loop)
            callbacks: list = [callback]

            # On the SDK backend, ANTHROPIC_API_KEY must be unset so the local
            # `claude` CLI's stored Max-subscription credentials are used. The
            # LangChain cost callback is unnecessary — SdkLlm writes LlmCost
            # rows itself from each ResultMessage.
            if settings.llm_backend == "sdk":
                import os
                os.environ.pop("ANTHROPIC_API_KEY", None)
            else:
                from . import cost_tracking
                callbacks.append(cost_tracking.CostTrackingCallback(run_id=h.run_id))

            run_id_for_graph = h.run_id

            def _run() -> tuple[dict, str]:
                ta = TradingAgentsGraph(debug=False, config=cfg, callbacks=callbacks)
                final_state, signal = ta.propagate(h.ticker, h.trade_date, run_id=run_id_for_graph)
                return final_state, signal

            final_state, signal = await loop.run_in_executor(None, _run)

            decision = final_state.get("final_trade_decision", "")
            h.final = {"signal": signal, "decision": decision}
            await self._emit(h, "final_decision", h.final)

            with Session(engine) as s:
                run = s.get(Run, h.run_id)
                if run:
                    run.status = "completed"
                    run.signal = signal
                    run.final_decision = decision
                    run.finished_at = datetime.utcnow()
                    s.add(run)
                    s.commit()

            await self._emit(h, "done", h.final)

        except Exception as e:
            logger.exception("run %s failed", h.run_id)
            err = {"error": type(e).__name__, "message": str(e)}
            await self._emit(h, "error", err)
            with Session(engine) as s:
                run = s.get(Run, h.run_id)
                if run:
                    run.status = "failed"
                    run.error = f"{type(e).__name__}: {e}"
                    run.finished_at = datetime.utcnow()
                    s.add(run)
                    s.commit()
            h.final = {"error": err}
        finally:
            h.done = True
            for q in h.queues:
                q.put_nowait({"event": "done", "data": h.final or {}})


class _StreamingCallback(BaseCallbackHandler):
    """LangChain callback that bridges LLM/tool/chain events to the SSE queue."""

    def __init__(self, handle: _RunHandle, loop: asyncio.AbstractEventLoop) -> None:
        self.h = handle
        self.loop = loop

    def _emit(self, event_type: str, payload: dict, node: str = "") -> None:
        asyncio.run_coroutine_threadsafe(
            manager._emit(self.h, event_type, payload, node=node), self.loop
        )

    def on_llm_start(self, serialized, prompts, **kw):  # noqa: ANN001
        run_id = kw.get("run_id")
        self._emit("llm_start", {"run_id": str(run_id), "model": (serialized or {}).get("name", "")})

    def on_llm_end(self, response, **kw):  # noqa: ANN001
        try:
            text = response.generations[0][0].text or ""
        except Exception:
            text = ""
        self._emit("llm_end", {"text": text[:200_000]})  # full agent reports

    def on_tool_start(self, serialized, input_str, **kw):  # noqa: ANN001
        self._emit("tool_start", {"tool": (serialized or {}).get("name", ""), "input": input_str[:50_000]})

    def on_tool_end(self, output, **kw):  # noqa: ANN001
        self._emit("tool_end", {"output": str(output)[:100_000]})

    def on_chain_start(self, serialized, inputs, **kw):  # noqa: ANN001
        name = (serialized or {}).get("name") or (serialized or {}).get("id", [None])[-1] or ""
        self._emit("chain_start", {"chain": str(name)})

    def on_chain_end(self, outputs, **kw):  # noqa: ANN001
        pass


manager = _Manager()
