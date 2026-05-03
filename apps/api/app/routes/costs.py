from fastapi import APIRouter
from ..services import cost_tracking

router = APIRouter(prefix="/costs", tags=["costs"])


@router.get("")
def get_costs():
    return cost_tracking.summary()


@router.get("/per-run")
def get_per_run():
    return cost_tracking.per_run()
