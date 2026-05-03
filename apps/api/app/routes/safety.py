from fastapi import APIRouter
from pydantic import BaseModel

from ..config import settings
from ..services import risk

router = APIRouter(prefix="/safety", tags=["safety"])


class KillBody(BaseModel):
    reason: str = "manual"


@router.get("")
def get_safety() -> dict:
    ks = risk.kill_switch_state()
    return {
        "kill_switch": {
            "engaged": ks.engaged,
            "reason": ks.reason,
            "engaged_at": str(ks.engaged_at) if ks.engaged_at else None,
        },
        "live_mode": settings.alpaca_live,
        "manual_approval": settings.alpaca_manual_approval,
        "limits": {
            "max_position_pct": settings.risk_max_position_pct,
            "daily_loss_limit_pct": settings.risk_daily_loss_limit_pct,
            "max_orders_per_day": settings.risk_max_orders_per_day,
            "risk_per_trade_pct": settings.risk_per_trade_pct,
            "stop_loss_pct": settings.risk_stop_loss_pct,
            "take_profit_pct": settings.risk_take_profit_pct,
        },
    }


@router.post("/kill")
def kill(body: KillBody) -> dict:
    risk.engage_kill_switch(body.reason)
    return {"engaged": True, "reason": body.reason}


@router.post("/release")
def release() -> dict:
    risk.release_kill_switch()
    return {"engaged": False}
