from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services import order_manager

router = APIRouter(prefix="/trades", tags=["trades"])


class RejectBody(BaseModel):
    reason: str = "user rejected"


class ManualOrderBody(BaseModel):
    symbol: str = Field(min_length=1, max_length=10)
    side: str  # buy | sell
    qty: float | None = None
    stop_price: float | None = None
    take_profit_price: float | None = None


@router.get("")
def list_trades(limit: int = 100):
    return order_manager.list_orders(limit=limit)


@router.post("/from-run/{run_id}")
def stage_from_run(run_id: int):
    try:
        return order_manager.stage_from_run(run_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{order_id}/approve")
def approve(order_id: int):
    try:
        return order_manager.approve_order(order_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{order_id}/reject")
def reject(order_id: int, body: RejectBody):
    try:
        return order_manager.reject_order(order_id, body.reason)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/manual")
def manual_order(body: ManualOrderBody):
    try:
        return order_manager.create_manual_order(
            symbol=body.symbol,
            side=body.side,
            qty=body.qty,
            stop_price=body.stop_price,
            take_profit_price=body.take_profit_price,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
