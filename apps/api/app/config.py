from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_live: bool = False
    alpaca_manual_approval: bool = True

    db_path: str = str(Path.home() / ".tradingagents" / "api.db")

    cors_origins: str = "http://localhost:3000"

    risk_max_position_pct: float = 0.10
    risk_daily_loss_limit_pct: float = 0.03
    risk_max_orders_per_day: int = 20
    risk_per_trade_pct: float = 0.02
    risk_stop_loss_pct: float = 0.05
    risk_take_profit_pct: float = 0.10

    deep_think_llm: str = "claude-sonnet-4-6"
    quick_think_llm: str = "claude-sonnet-4-6"
    # "sdk" → Agent SDK via local `claude` CLI (Max subscription).
    # "langchain" → ChatAnthropic via API key (pay-as-you-go).
    llm_backend: str = "sdk"
    max_debate_rounds: int = 1

    # Run rate limit — protects Anthropic budget from runaway loops
    run_rate_limit_per_day: int = 50

    # Optional: Financial Datasets API key (https://financialdatasets.ai)
    # Falls back here when yfinance .info / .financials are sparse —
    # especially useful for non-US tickers and for ratios yfinance doesn't expose.
    financial_datasets_api_key: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
