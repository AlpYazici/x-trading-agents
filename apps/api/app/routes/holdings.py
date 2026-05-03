from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import Holding, get_session
from ..services import holdings as svc

router = APIRouter(prefix="/holdings", tags=["holdings"])


class HoldingIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    exchange: str = "US"  # US, BIST, CRYPTO
    qty: float = Field(gt=0)
    entry_price: float = Field(gt=0)
    currency: str = "USD"  # USD, TRY, EUR
    notes: Optional[str] = None


class HoldingOut(BaseModel):
    id: int
    symbol: str
    exchange: str
    qty: float
    entry_price: float
    currency: str
    notes: Optional[str]
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    market_value_usd: Optional[float] = None
    pl: Optional[float] = None
    pl_pct: Optional[float] = None
    fx_rate: Optional[float] = None


@router.get("", response_model=list[HoldingOut])
def list_holdings(session: Session = Depends(get_session)):
    rows = session.exec(select(Holding).order_by(Holding.id)).all()  # type: ignore[arg-type]
    out: list[HoldingOut] = []
    for h in rows:
        price = svc.get_price(h.symbol, h.exchange)
        mv = price * h.qty if price else None
        pl = (price - h.entry_price) * h.qty if price else None
        pl_pct = ((price / h.entry_price) - 1) if price else None
        fx = svc.fx_rate(h.currency, "USD")
        mv_usd = mv * fx if (mv is not None and fx) else None
        out.append(
            HoldingOut(
                id=h.id,  # type: ignore[arg-type]
                symbol=h.symbol,
                exchange=h.exchange,
                qty=h.qty,
                entry_price=h.entry_price,
                currency=h.currency,
                notes=h.notes,
                current_price=price,
                market_value=mv,
                market_value_usd=mv_usd,
                pl=pl,
                pl_pct=pl_pct,
                fx_rate=fx,
            )
        )
    return out


@router.post("", response_model=HoldingOut)
def add_holding(body: HoldingIn, session: Session = Depends(get_session)):
    h = Holding(**body.model_dump())
    session.add(h)
    session.commit()
    session.refresh(h)
    price = svc.get_price(h.symbol, h.exchange)
    mv = price * h.qty if price else None
    pl = (price - h.entry_price) * h.qty if price else None
    pl_pct = ((price / h.entry_price) - 1) if price else None
    fx = svc.fx_rate(h.currency, "USD")
    mv_usd = mv * fx if (mv is not None and fx) else None
    return HoldingOut(
        id=h.id, symbol=h.symbol, exchange=h.exchange, qty=h.qty,  # type: ignore[arg-type]
        entry_price=h.entry_price, currency=h.currency, notes=h.notes,
        current_price=price, market_value=mv, market_value_usd=mv_usd,
        pl=pl, pl_pct=pl_pct, fx_rate=fx,
    )


@router.delete("/{holding_id}")
def delete_holding(holding_id: int, session: Session = Depends(get_session)):
    h = session.get(Holding, holding_id)
    if not h:
        raise HTTPException(404, "holding not found")
    session.delete(h)
    session.commit()
    return {"deleted": holding_id}


@router.put("/{holding_id}", response_model=HoldingOut)
def update_holding(holding_id: int, body: HoldingIn, session: Session = Depends(get_session)):
    h = session.get(Holding, holding_id)
    if not h:
        raise HTTPException(404, "holding not found")
    for k, v in body.model_dump().items():
        setattr(h, k, v)
    session.add(h)
    session.commit()
    session.refresh(h)
    return list_holdings(session)[0] if False else _serialize(h)


def _serialize(h: Holding) -> HoldingOut:
    price = svc.get_price(h.symbol, h.exchange)
    mv = price * h.qty if price else None
    pl = (price - h.entry_price) * h.qty if price else None
    pl_pct = ((price / h.entry_price) - 1) if price else None
    fx = svc.fx_rate(h.currency, "USD")
    mv_usd = mv * fx if (mv is not None and fx) else None
    return HoldingOut(
        id=h.id, symbol=h.symbol, exchange=h.exchange, qty=h.qty,  # type: ignore[arg-type]
        entry_price=h.entry_price, currency=h.currency, notes=h.notes,
        current_price=price, market_value=mv, market_value_usd=mv_usd,
        pl=pl, pl_pct=pl_pct, fx_rate=fx,
    )
