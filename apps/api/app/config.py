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

    deep_think_llm: str = "claude-opus-4-7"
    quick_think_llm: str = "claude-sonnet-4-6"
    max_debate_rounds: int = 1

    # Run rate limit — protects Anthropic budget from runaway loops
    run_rate_limit_per_day: int = 50

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
