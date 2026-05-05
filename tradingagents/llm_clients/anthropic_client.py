from typing import Any, List, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, SystemMessage

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model

_PASSTHROUGH_KWARGS = (
    "timeout", "max_retries", "api_key", "max_tokens",
    "callbacks", "http_client", "http_async_client", "effort",
)

# Anthropic prompt caching: tag the system message with cache_control so the
# (large, ~static) instructions get cached for 5 minutes. Cache reads cost
# ~10% of normal input tokens, cache writes cost 125% one-time.
#
# Within a single agent run, each analyst node invokes the LLM multiple
# times for tool calls — calls 2..N hit the cache. Across runs in a tight
# batch (scheduled scan firing 5 tickers in sequence), same-analyst calls
# also benefit even though the dynamic suffix (date / ticker context)
# differs — the static prefix still gets cached because the API matches
# from the start until the first cache_control marker.
_CACHE_CONTROL = {"type": "ephemeral"}


def _tag_cache_control(messages: List[BaseMessage]) -> List[BaseMessage]:
    """Mark the last block of the system message with cache_control.

    Mirrors AnthropicPromptCachingMiddleware._tag_system_message but works
    against a plain list-of-BaseMessage signature instead of the agent
    middleware framework — which our LangGraph wiring doesn't expose.
    """
    if not messages:
        return messages
    out: List[BaseMessage] = []
    for msg in messages:
        if isinstance(msg, SystemMessage):
            content = msg.content
            if isinstance(content, str) and content:
                new_content = [
                    {"type": "text", "text": content, "cache_control": _CACHE_CONTROL}
                ]
                out.append(SystemMessage(content=new_content))
                continue
            if isinstance(content, list) and content:
                new_content = list(content)
                last = new_content[-1]
                base = last if isinstance(last, dict) else {"type": "text", "text": str(last)}
                if "cache_control" not in base:
                    new_content[-1] = {**base, "cache_control": _CACHE_CONTROL}
                    out.append(SystemMessage(content=new_content))
                    continue
        out.append(msg)
    return out


class NormalizedChatAnthropic(ChatAnthropic):
    """ChatAnthropic with normalized content output AND prompt caching.

    Two behaviors:
    - Output content is normalized to string (extended thinking / tool-use
      models return list-of-typed-blocks otherwise).
    - System messages are auto-tagged with cache_control on _generate /
      _agenerate so prompt caching kicks in transparently for every call.
    """

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        return super()._generate(_tag_cache_control(messages), stop, run_manager, **kwargs)

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        return await super()._agenerate(_tag_cache_control(messages), stop, run_manager, **kwargs)

    def invoke(self, input, config=None, **kwargs):
        return normalize_content(super().invoke(input, config, **kwargs))


class AnthropicClient(BaseLLMClient):
    """Client for Anthropic Claude models."""

    def __init__(self, model: str, base_url: Optional[str] = None, **kwargs):
        super().__init__(model, base_url, **kwargs)

    def get_llm(self) -> Any:
        """Return configured ChatAnthropic instance."""
        self.warn_if_unknown_model()
        llm_kwargs = {"model": self.model}

        if self.base_url:
            llm_kwargs["base_url"] = self.base_url

        for key in _PASSTHROUGH_KWARGS:
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        return NormalizedChatAnthropic(**llm_kwargs)

    def validate_model(self) -> bool:
        """Validate model for Anthropic."""
        return validate_model("anthropic", self.model)
